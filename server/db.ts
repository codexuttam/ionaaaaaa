import mongoose, { type Model, type Schema } from 'mongoose'
import type { ContactKind, ContactMessage } from './contact.ts'

/**
 * Always register a model against the *current* schema. Reusing `mongoose.models[name]`
 * kept a stale model alive in the long-running dev server, so schema edits (e.g. `phone`,
 * the `all_submissions` collection) were silently ignored until a full restart.
 */
function freshModel<T>(name: string, schema: Schema<T>): Model<T> {
  if (mongoose.models[name]) mongoose.deleteModel(name)
  return mongoose.model<T>(name, schema)
}

/* -------------------------------------------------------------
 * 1. Waitlist Schema & Model (collection: 'waitlists')
 * ------------------------------------------------------------*/
export interface IWaitlist {
  name: string
  email: string
  phone?: string
  city: string
  source: string
  status: string
  createdAt: Date
}

const WaitlistSchema = new mongoose.Schema<IWaitlist>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    source: { type: String, default: 'launch_list_waitlist' },
    status: { type: String, default: 'waitlisted' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'waitlists', timestamps: true }
)

export const WaitlistSubmission: Model<IWaitlist> =
  freshModel<IWaitlist>('WaitlistSubmission', WaitlistSchema)

/* -------------------------------------------------------------
 * 2. Bulk Order / Hospitality Schema & Model (collection: 'bulk_orders')
 * ------------------------------------------------------------*/
export interface IBulkOrder {
  name: string
  email: string
  phone?: string
  city: string
  business: string
  message: string
  source: string
  status: string
  createdAt: Date
}

const BulkOrderSchema = new mongoose.Schema<IBulkOrder>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    business: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    source: { type: String, default: 'hospitality_bulk_enquiry' },
    status: { type: String, default: 'new_order_enquiry' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'bulk_orders', timestamps: true }
)

export const BulkOrderSubmission: Model<IBulkOrder> =
  freshModel<IBulkOrder>('BulkOrderSubmission', BulkOrderSchema)

/* -------------------------------------------------------------
 * 3. General Contact Schema & Model (collection: 'contacts')
 * ------------------------------------------------------------*/
export interface IContactMessageDoc {
  name: string
  email: string
  phone?: string
  message: string
  source: string
  status: string
  createdAt: Date
}

const ContactMessageSchema = new mongoose.Schema<IContactMessageDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    source: { type: String, default: 'general_contact' },
    status: { type: String, default: 'new_message' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'contacts', timestamps: true }
)

export const ContactMessageSubmission: Model<IContactMessageDoc> =
  freshModel<IContactMessageDoc>('ContactMessageSubmission', ContactMessageSchema)

/* -------------------------------------------------------------
 * 4. Unified All Submissions (collection: 'all_submissions')
 * ------------------------------------------------------------*/
export interface IContactSubmission {
  kind: ContactKind
  name: string
  email: string
  phone?: string
  city?: string
  business?: string
  message?: string
  createdAt: Date
}

const ContactSubmissionSchema = new mongoose.Schema<IContactSubmission>(
  {
    kind: {
      type: String,
      required: true,
      enum: ['contact', 'launch', 'hospitality'],
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    business: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'all_submissions', timestamps: true }
)

export const ContactSubmission: Model<IContactSubmission> =
  freshModel<IContactSubmission>('ContactSubmission', ContactSubmissionSchema)

/* -------------------------------------------------------------
 * Connection Manager
 * ------------------------------------------------------------*/
let isConnected = false

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  const mongoUri = uri || process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured')
  }

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose
  }

  const conn = await mongoose.connect(mongoUri)
  isConnected = conn.connection.readyState === 1
  return conn
}

/* -------------------------------------------------------------
 * Save Submission to both its specific section & master log
 * ------------------------------------------------------------*/
export async function saveContactSubmission(
  message: ContactMessage,
  mongoUri?: string
): Promise<{ general: IContactSubmission; specific: unknown }> {
  await connectDB(mongoUri)

  // 1. Save to master all_submissions collection
  const general = await ContactSubmission.create({
    kind: message.kind,
    name: message.name,
    email: message.email,
    phone: message.phone || '',
    city: message.city,
    business: message.business,
    message: message.message,
    createdAt: new Date(),
  })

  // 2. Save to dedicated section / collection based on form kind
  let specific: unknown = null
  if (message.kind === 'launch') {
    // Waitlist section
    specific = await WaitlistSubmission.create({
      name: message.name,
      email: message.email,
      phone: message.phone || '',
      city: message.city,
      source: 'launch_list_waitlist',
      status: 'waitlisted',
      createdAt: new Date(),
    })
  } else if (message.kind === 'hospitality') {
    // Bulk Order / Hospitality section
    specific = await BulkOrderSubmission.create({
      name: message.name,
      email: message.email,
      phone: message.phone || '',
      city: message.city,
      business: message.business,
      message: message.message,
      source: 'hospitality_bulk_enquiry',
      status: 'new_order_enquiry',
      createdAt: new Date(),
    })
  } else {
    // General Contact section
    specific = await ContactMessageSubmission.create({
      name: message.name,
      email: message.email,
      phone: message.phone || '',
      message: message.message,
      source: 'general_contact',
      status: 'new_message',
      createdAt: new Date(),
    })
  }

  return { general, specific }
}

/* -------------------------------------------------------------
 * Admin Data Fetcher & Delete
 * ------------------------------------------------------------*/
export async function getAdminDashboardData(mongoUri?: string) {
  await connectDB(mongoUri)
  const [waitlists, bulkOrders, contacts, allSubmissions] = await Promise.all([
    WaitlistSubmission.find().sort({ createdAt: -1 }).lean(),
    BulkOrderSubmission.find().sort({ createdAt: -1 }).lean(),
    ContactMessageSubmission.find().sort({ createdAt: -1 }).lean(),
    ContactSubmission.find().sort({ createdAt: -1 }).lean(),
  ])

  return {
    stats: {
      totalWaitlist: waitlists.length,
      totalBulkOrders: bulkOrders.length,
      totalContacts: contacts.length,
      totalAll: allSubmissions.length,
    },
    waitlists,
    bulkOrders,
    contacts,
    allSubmissions,
  }
}

export async function deleteAdminRecord(
  _collection: string,
  id: string,
  mongoUri?: string
): Promise<boolean> {
  await connectDB(mongoUri)
  type Twin = { name: string; email: string; createdAt: Date }
  const models = [WaitlistSubmission, BulkOrderSubmission, ContactMessageSubmission, ContactSubmission] as unknown as Model<Twin>[]

  // 1. Delete the record itself, wherever it lives
  const results = await Promise.allSettled(models.map((m) => m.findByIdAndDelete(id).lean()))
  const deleted = results.find((r) => r.status === 'fulfilled' && r.value)
  if (!deleted || deleted.status !== 'fulfilled' || !deleted.value) return false

  // 2. Delete its twin (same submission saved in all_submissions + its section, with a different _id):
  //    same email + name, created within a few seconds of each other
  const doc = deleted.value as { name: string; email: string; createdAt: Date }
  const at = new Date(doc.createdAt).getTime()
  const twin = {
    email: doc.email,
    name: doc.name,
    createdAt: { $gte: new Date(at - 10_000), $lte: new Date(at + 10_000) },
  }
  await Promise.allSettled(models.map((m) => m.deleteMany(twin)))
  return true
}


