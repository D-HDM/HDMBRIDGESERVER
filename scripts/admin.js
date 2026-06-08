#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../config/dnsSet');

const mongoose = require('mongoose');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/admin/AdminUser');
const AdminRole = require('../models/admin/AdminRole');
const connectDB = require('../config/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function pressEnter() {
  await question('\nPress Enter to continue...');
  await mainMenu();
}

async function mainMenu() {
  console.clear();
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        HDM BRIDGE - ADMIN CLI            ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  1. List Admins                          ║');
  console.log('║  2. Create Admin                         ║');
  console.log('║  3. Manage Admin (Activate/Deactivate)   ║');
  console.log('║  4. Delete Admin                         ║');
  console.log('║  5. List Roles                           ║');
  console.log('║  6. Create Role                          ║');
  console.log('║  7. List DB Collections                  ║');
  console.log('║  8. Drop Collection                      ║');
  console.log('║  9. Drop Entire Database                 ║');
  console.log('║  0. Exit                                 ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const choice = await question('Select option: ');

  switch (choice) {
    case '1': await listAdmins(); break;
    case '2': await createAdmin(); break;
    case '3': await manageAdmin(); break;
    case '4': await deleteAdmin(); break;
    case '5': await listRoles(); break;
    case '6': await createRole(); break;
    case '7': await listCollections(); break;
    case '8': await dropCollection(); break;
    case '9': await dropDatabase(); break;
    case '0':
      console.log('\n👋 Goodbye!\n');
      process.exit(0);
    default:
      console.log('\n❌ Invalid option');
      await pressEnter();
  }
}

async function listAdmins() {
  console.log('\n📋 All Admin Users:\n');
  const admins = await AdminUser.find().populate('role', 'name');
  
  if (admins.length === 0) {
    console.log('No admins found.');
  } else {
    admins.forEach((admin, i) => {
      console.log(`${i + 1}. ${admin.firstName} ${admin.lastName} (${admin.email})`);
      console.log(`   Role: ${admin.role?.name || 'N/A'} | Active: ${admin.isActive ? '✅' : '❌'} | Super Admin: ${admin.isSuperAdmin ? '✅' : '❌'}`);
      console.log('');
    });
  }
  await pressEnter();
}

async function createAdmin() {
  console.log('\n➕ Create New Admin\n');
  
  const firstName = await question('First Name: ');
  const lastName = await question('Last Name: ');
  const email = await question('Email: ');
  const password = await question('Password: ');

  const staticRoles = [
    { name: 'Super Admin', slug: 'super_admin' },
    { name: 'Admin', slug: 'admin' },
  ];

  console.log('\nAvailable Roles:');
  staticRoles.forEach((r, i) => console.log(`  ${i + 1}. ${r.name}`));

  const roleIndex = await question('\nSelect role number: ');
  const selectedRole = staticRoles[parseInt(roleIndex) - 1];

  if (!selectedRole) {
    console.log('❌ Invalid role');
    await pressEnter();
    return;
  }

  // Find or create the role in DB
  let role = await AdminRole.findOne({ slug: selectedRole.slug });
  if (!role) {
    const permissions = selectedRole.slug === 'super_admin' 
      ? [
          'users.view', 'users.create', 'users.edit', 'users.delete', 'users.suspend',
          'payments.view', 'payments.refund', 'payments.manual',
          'plans.view', 'plans.create', 'plans.edit', 'plans.delete',
          'currency.view', 'currency.edit',
          'system.view', 'system.edit',
          'legal.view', 'legal.edit',
          'analytics.view', 'analytics.export',
          'ai_widget.view', 'ai_widget.edit',
          'backup.view', 'backup.create', 'backup.restore', 'backup.delete',
          'admins.view', 'admins.create', 'admins.edit', 'admins.delete',
          'audit.view', 'audit.export',
        ]
      : [
          'users.view', 'users.edit',
          'payments.view',
          'plans.view', 'plans.edit',
          'currency.view',
          'system.view',
          'legal.view',
          'analytics.view',
          'ai_widget.view',
          'backup.view', 'backup.create', 'backup.restore',
          'audit.view',
        ];

    role = await AdminRole.create({
      name: selectedRole.name,
      slug: selectedRole.slug,
      permissions,
      isActive: true,
    });
  }

  const confirm = await question(`\nCreate admin ${firstName} ${lastName} (${email}) as ${selectedRole.name}? (y/n): `);
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    await pressEnter();
    return;
  }

  try {
    const admin = await AdminUser.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      role: role._id,
      isSuperAdmin: selectedRole.slug === 'super_admin',
    });

    console.log(`\n✅ Admin created: ${admin.email} (${selectedRole.name})`);
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
  await pressEnter();
}

async function manageAdmin() {
  console.log('\n🔧 Manage Admin (Activate/Deactivate)\n');
  const admins = await AdminUser.find().populate('role', 'name');
  
  admins.forEach((admin, i) => {
    console.log(`${i + 1}. ${admin.email} - ${admin.isActive ? '🟢 Active' : '🔴 Inactive'}`);
  });

  const index = await question('\nSelect admin number (0 to cancel): ');
  if (index === '0') { await pressEnter(); return; }

  const admin = admins[parseInt(index) - 1];
  if (!admin) {
    console.log('❌ Invalid selection');
    await pressEnter();
    return;
  }

  console.log(`\nCurrent status: ${admin.isActive ? 'Active' : 'Inactive'}`);
  const action = await question('Toggle status? (y/n): ');

  if (action.toLowerCase() === 'y') {
    admin.isActive = !admin.isActive;
    await admin.save();
    console.log(`✅ Admin ${admin.email} is now ${admin.isActive ? 'Active' : 'Inactive'}`);
  }
  await pressEnter();
}

async function deleteAdmin() {
  console.log('\n🗑️  Delete Admin\n');
  const admins = await AdminUser.find();
  
  admins.forEach((admin, i) => {
    if (!admin.isSuperAdmin) {
      console.log(`${i + 1}. ${admin.email}`);
    }
  });

  const index = await question('\nSelect admin number (0 to cancel): ');
  if (index === '0') { await pressEnter(); return; }

  const admin = admins[parseInt(index) - 1];
  if (!admin) {
    console.log('❌ Invalid selection');
    await pressEnter();
    return;
  }

  if (admin.isSuperAdmin) {
    console.log('❌ Cannot delete Super Admin');
    await pressEnter();
    return;
  }

  const confirm = await question(`\n⚠️  Permanently delete ${admin.email}? Type DELETE to confirm: `);
  
  if (confirm === 'DELETE') {
    await AdminUser.findByIdAndDelete(admin._id);
    console.log(`✅ Admin deleted: ${admin.email}`);
  } else {
    console.log('Cancelled.');
  }
  await pressEnter();
}

async function listRoles() {
  console.log('\n📋 All Roles:\n');
  const roles = await AdminRole.find();
  
  if (roles.length === 0) {
    console.log('No roles found.');
  } else {
    roles.forEach((role, i) => {
      console.log(`${i + 1}. ${role.name} (${role.slug})`);
      console.log(`   Permissions: ${role.permissions.length}`);
      console.log(`   Active: ${role.isActive ? '✅' : '❌'}`);
      console.log('');
    });
  }
  await pressEnter();
}

async function createRole() {
  console.log('\n➕ Create New Role\n');
  
  const name = await question('Role Name: ');
  const description = await question('Description: ');
  const slug = name.toLowerCase().replace(/\s+/g, '_');

  const permissionsList = [
    'users.view', 'users.create', 'users.edit', 'users.delete', 'users.suspend',
    'payments.view', 'payments.refund', 'payments.manual',
    'plans.view', 'plans.create', 'plans.edit', 'plans.delete',
    'currency.view', 'currency.edit',
    'system.view', 'system.edit',
    'legal.view', 'legal.edit',
    'analytics.view', 'analytics.export',
    'ai_widget.view', 'ai_widget.edit',
    'backup.view', 'backup.create', 'backup.restore', 'backup.delete',
    'admins.view', 'admins.create', 'admins.edit', 'admins.delete',
    'audit.view', 'audit.export',
  ];

  console.log('\nAvailable Permissions:');
  permissionsList.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  const selected = await question('\nEnter permission numbers (comma-separated, e.g. 1,3,5): ');
  const indices = selected.split(',').map(s => parseInt(s.trim()) - 1);
  const permissions = indices.map(i => permissionsList[i]).filter(Boolean);

  const confirm = await question(`\nCreate role "${name}" with ${permissions.length} permissions? (y/n): `);

  if (confirm.toLowerCase() === 'y') {
    try {
      await AdminRole.create({ name, slug, description, permissions });
      console.log(`✅ Role created: ${name}`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  await pressEnter();
}

async function listCollections() {
  console.log('\n📦 Database Collections:\n');
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  collections.forEach((col, i) => {
    console.log(`${i + 1}. ${col.name}`);
  });

  console.log(`\nTotal: ${collections.length} collections`);
  await pressEnter();
}

async function dropCollection() {
  console.log('\n⚠️  Drop Collection\n');
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  collections.forEach((col, i) => {
    console.log(`${i + 1}. ${col.name}`);
  });

  const index = await question('\nSelect collection number (0 to cancel): ');
  if (index === '0') { await pressEnter(); return; }

  const collection = collections[parseInt(index) - 1];
  if (!collection) {
    console.log('❌ Invalid selection');
    await pressEnter();
    return;
  }

  const confirm = await question(`\n⚠️  Permanently drop "${collection.name}"? Type DROP to confirm: `);

  if (confirm === 'DROP') {
    await mongoose.connection.db.dropCollection(collection.name);
    console.log(`✅ Collection dropped: ${collection.name}`);
  } else {
    console.log('Cancelled.');
  }
  await pressEnter();
}

async function dropDatabase() {
  console.log('\n🚨 DROP ENTIRE DATABASE 🚨\n');
  console.log(`Database: ${process.env.MONGODB_URI}`);
  
  const step1 = await question('Type the database name (hdm_bridge) to continue: ');
  if (step1 !== 'hdm_bridge') {
    console.log('❌ Incorrect database name. Aborted.');
    await pressEnter();
    return;
  }

  const step2 = await question('Type DROP EVERYTHING to confirm: ');
  if (step2 !== 'DROP EVERYTHING') {
    console.log('❌ Aborted.');
    await pressEnter();
    return;
  }

  const step3 = await question('Are you absolutely sure? (yes/no): ');
  if (step3 !== 'yes') {
    console.log('❌ Aborted.');
    await pressEnter();
    return;
  }

  console.log('\n⏳ Dropping database...');
  await mongoose.connection.db.dropDatabase();
  console.log('✅ Database dropped successfully.');
  console.log('⚠️  Restart the server to rebuild collections.\n');
  await pressEnter();
}

async function start() {
  try {
    await connectDB();
    console.log('✅ Connected to database');
    await mainMenu();
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!\n');
  process.exit(0);
});

start();