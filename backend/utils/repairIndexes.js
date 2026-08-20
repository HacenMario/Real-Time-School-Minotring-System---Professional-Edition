const mongoose = require('mongoose');

/**
 * Repairs legacy Notification.notificationKey index definitions.
 * Safe to run on existing deployments.
 */
async function repairNotificationIndex() {
  const collection = mongoose.connection.collection('notifications');
  const indexes = await collection.indexes();
  const idx = indexes.find(i => i.name === 'notificationKey_1');
  if (idx && idx.unique && !idx.sparse) {
    await collection.dropIndex('notificationKey_1');
    await collection.createIndex(
      { notificationKey: 1 },
      { unique: true, sparse: true, name: 'notificationKey_1' }
    );
    return true;
  }
  return false;
}

module.exports = { repairNotificationIndex };
