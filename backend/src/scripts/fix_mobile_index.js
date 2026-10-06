import mongoose from 'mongoose';
import { ENV } from '../lib/env.js';

const run = async () => {
  try {
    const { MONGO_URI } = ENV;
    if (!MONGO_URI) throw new Error('MONGO_URI not set in ENV');

    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const collName = 'users';

    // Drop existing index if it exists
    try {
      console.log('Dropping existing index mobileNumber_1 if present...');
      await db.collection(collName).dropIndex('mobileNumber_1');
      console.log('Dropped index mobileNumber_1');
    } catch (err) {
      console.log('Index did not exist or could not be dropped:', err.message);
    }

    // Create partial unique index that only indexes documents where mobileNumber exists
    console.log('Creating partial unique index on mobileNumber...');
    await db.collection(collName).createIndex(
      { mobileNumber: 1 },
      { unique: true, partialFilterExpression: { mobileNumber: { $exists: true } } }
    );

    console.log('Partial unique index created successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to fix mobileNumber index:', error);
    process.exit(1);
  }
};

run();
