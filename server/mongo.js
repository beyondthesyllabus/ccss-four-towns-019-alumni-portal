const { MongoClient } = require('mongodb');

let cached = null;

async function connect() {
  if (cached) return cached;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw Object.assign(new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string.'), { status: 500 });
  cached = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return cached;
}

let indexed = false;

async function getDb() {
  const client = await connect();
  const db = client.db(process.env.MONGODB_DB || 'ccss_alumni');
  if (!indexed) {
    indexed = true;
    await db.collection('members').createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: '' } } });
    await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  }
  return db;
}

async function nextId(db, name) {
  const c = await db.collection('counters').findOneAndUpdate({ _id: name }, { $inc: { v: 1 } }, { upsert: true, returnDocument: 'after' });
  return c.v;
}

module.exports = { getDb, nextId };
