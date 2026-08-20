const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const LeaveRequest = require('../models/LeaveRequest');
const SmartAlert = require('../models/SmartAlert');
const AlertRule = require('../models/AlertRule');
const Holiday = require('../models/Holiday');
const Subscription = require('../models/Subscription');
const SchoolSettings = require('../models/SchoolSettings');
const logger = require('../utils/logger');

async function ensureDefaultTenant() {
  const key = String(
    process.env.DEFAULT_TENANT_KEY || 'default-school'
  ).toLowerCase();

  const name =
    process.env.DEFAULT_TENANT_NAME || 'Default School';

  let tenant = await Tenant.findOne({ key });

  if (!tenant) {
    tenant = await Tenant.create({
      key,
      name,
    });
  }

  /*
   * Migrate legacy records that do not have a tenant.
   *
   * IMPORTANT:
   * SchoolSettings is intentionally excluded from this migration.
   *
   * A SchoolSettings document with tenantId:null represents the
   * public/global settings. Converting it to the default tenant
   * can collide with an existing tenant-specific settings document
   * because tenantId has a unique index.
   */
  const models = [
    User,
    Student,
    Attendance,
    Notification,
    LeaveRequest,
    SmartAlert,
    AlertRule,
    Holiday,
    Subscription,
  ];

  for (const Model of models) {
    try {
      await Model.updateMany(
        { tenantId: null },
        { $set: { tenantId: tenant._id } }
      );
    } catch (err) {
      logger.warn(
        `Tenant migration skipped for ${Model.modelName}:`,
        err.message
      );
    }
  }

  /*
   * DO NOT execute:
   *
   * await SchoolSettings.updateMany(
   *   { tenantId: null },
   *   { $set: { tenantId: tenant._id } }
   * );
   *
   * Global SchoolSettings must remain tenantId:null.
   */

  /*
   * If the default tenant does not yet have its own settings,
   * create a dedicated settings document for it.
   *
   * We intentionally do not modify an existing tenant's settings.
   */
  try {
    const existingTenantSettings =
      await SchoolSettings.findOne({
        tenantId: tenant._id,
      }).lean();

    if (!existingTenantSettings) {
      const globalSettings =
        await SchoolSettings.findOne({
          tenantId: null,
        }).lean();

      const settingsData = {
        tenantId: tenant._id,
      };

      /*
       * If global settings exist, use them only as initial
       * defaults for the default tenant.
       *
       * The global document itself is never modified.
       */
      if (globalSettings) {
        const copyableFields = [
          'schoolName',
          'address',
          'phone',
          'email',
          'logo',
          'logoFileName',
          'schoolEndTime',
          'notificationBeforeMinutes',
        ];

        for (const field of copyableFields) {
          if (globalSettings[field] !== undefined) {
            settingsData[field] = globalSettings[field];
          }
        }
      }

      await SchoolSettings.create(settingsData);
    }
  } catch (err) {
    /*
     * If another process created the settings document
     * simultaneously, do not crash the entire application.
     */
    if (err.code === 11000) {
      logger.warn(
        'Default tenant SchoolSettings already exists; continuing startup.'
      );
    } else {
      throw err;
    }
  }

  try {
    await AlertRule.syncIndexes();
  } catch (e) {
    logger.warn(
      'AlertRule index sync:',
      e.message
    );
  }

  return tenant;
}

module.exports = {
  ensureDefaultTenant,
};
