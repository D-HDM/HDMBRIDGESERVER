const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Transaction = require('../models/client/Transaction');
const Subscription = require('../models/client/Subscription');
const Organization = require('../models/client/Organization');
const logger = require('../utils/logger');

class StripeService {
  async createCustomer(organization) {
    try {
      const customer = await stripe.customers.create({
        name: organization.name,
        email: organization.billing?.billingEmail || organization.email,
        metadata: {
          organizationId: organization._id.toString(),
        },
      });

      await Organization.findByIdAndUpdate(organization._id, {
        'billing.stripeCustomerId': customer.id,
      });

      return customer;
    } catch (error) {
      logger.error('Stripe create customer failed:', error.message);
      throw error;
    }
  }

  async createCheckoutSession(organization, plan, successUrl, cancelUrl) {
    try {
      let customerId = organization.billing?.stripeCustomerId;

      if (!customerId) {
        const customer = await this.createCustomer(organization);
        customerId = customer.id;
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: plan.price.currency.toLowerCase(),
              product_data: {
                name: plan.name,
                description: plan.description,
              },
              unit_amount: Math.round(plan.price.amount * 100),
              recurring: {
                interval: plan.price.interval,
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          organizationId: organization._id.toString(),
          planId: plan._id.toString(),
        },
        subscription_data: {
          trial_period_days: plan.trialPeriod?.enabled ? plan.trialPeriod.days : undefined,
          metadata: {
            organizationId: organization._id.toString(),
            planId: plan._id.toString(),
          },
        },
      });

      return session;
    } catch (error) {
      logger.error('Stripe checkout session failed:', error.message);
      throw error;
    }
  }

  async handleWebhook(payload, signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      switch (event.type) {
        case 'checkout.session.completed':
          return this.handleCheckoutCompleted(event.data.object);
        
        case 'invoice.paid':
          return this.handleInvoicePaid(event.data.object);
        
        case 'invoice.payment_failed':
          return this.handleInvoicePaymentFailed(event.data.object);
        
        case 'customer.subscription.updated':
          return this.handleSubscriptionUpdated(event.data.object);
        
        case 'customer.subscription.deleted':
          return this.handleSubscriptionDeleted(event.data.object);
        
        default:
          logger.info(`Unhandled Stripe event: ${event.type}`);
          return { received: true, type: event.type };
      }
    } catch (error) {
      logger.error('Stripe webhook error:', error.message);
      throw error;
    }
  }

  async handleCheckoutCompleted(session) {
    const { organizationId, planId } = session.metadata;

    await Subscription.findOneAndUpdate(
      {
        organizationId,
        paymentProviderSubscriptionId: session.subscription,
      },
      {
        organizationId,
        planId,
        status: 'active',
        paymentMethod: 'stripe',
        paymentProviderSubscriptionId: session.subscription,
        paymentProviderCustomerId: session.customer,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    await Transaction.create({
      organizationId,
      type: 'subscription',
      status: 'completed',
      amount: session.amount_total / 100,
      currency: session.currency?.toUpperCase(),
      paymentMethod: 'stripe',
      paymentProvider: {
        name: 'stripe',
        transactionId: session.payment_intent,
      },
      description: 'Subscription payment',
    });

    return { success: true, type: 'checkout.completed' };
  }

  async handleInvoicePaid(invoice) {
    if (invoice.billing_reason === 'subscription_cycle') {
      await Transaction.create({
        organizationId: invoice.metadata.organizationId,
        type: 'subscription',
        status: 'completed',
        amount: invoice.amount_paid / 100,
        currency: invoice.currency?.toUpperCase(),
        paymentMethod: 'stripe',
        paymentProvider: {
          name: 'stripe',
          transactionId: invoice.payment_intent,
        },
        description: 'Subscription renewal',
      });
    }
  }

  async handleInvoicePaymentFailed(invoice) {
    await Subscription.findOneAndUpdate(
      { paymentProviderSubscriptionId: invoice.subscription },
      { status: 'past_due' }
    );
  }

  async handleSubscriptionUpdated(subscription) {
    await Subscription.findOneAndUpdate(
      { paymentProviderSubscriptionId: subscription.id },
      {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      }
    );
  }

  async handleSubscriptionDeleted(subscription) {
    await Subscription.findOneAndUpdate(
      { paymentProviderSubscriptionId: subscription.id },
      {
        status: 'canceled',
        canceledAt: new Date(),
        endedAt: new Date(),
      }
    );
  }

  async cancelSubscription(subscriptionId) {
    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      await Subscription.findOneAndUpdate(
        { paymentProviderSubscriptionId: subscriptionId },
        { cancelAtPeriodEnd: true }
      );

      return { success: true, message: 'Subscription will cancel at period end' };
    } catch (error) {
      logger.error('Stripe cancel subscription failed:', error.message);
      throw error;
    }
  }

  async createRefund(transactionId, amount, reason) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: transactionId,
        amount: Math.round(amount * 100),
        reason: reason || 'requested_by_customer',
      });

      await Transaction.findOneAndUpdate(
        { 'paymentProvider.transactionId': transactionId },
        {
          status: amount === refund.amount ? 'refunded' : 'partially_refunded',
          refundDetails: {
            refundedAt: new Date(),
            refundAmount: amount,
            reason,
            refundTransactionId: refund.id,
          },
        }
      );

      return refund;
    } catch (error) {
      logger.error('Stripe refund failed:', error.message);
      throw error;
    }
  }
}

module.exports = new StripeService();