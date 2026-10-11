import mongoose, { type Model } from 'mongoose'
import type { ContactKind, ContactMessage } from './contact.ts'

/* -------------------------------------------------------------
 * 1. Waitlist Schema & Model (collection: 'waitlists')
 * ------------------------------------------------------------*/
export interface IWaitlist {
  name: string
  email: string
  city: string
  source: string
  status: string
  createdAt: Date
}

const WaitlistSchema = new mongoose.Schema<IWaitlist>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    city: { type: String, default: '', trim: true },
    source: { type: String, default: 'launch_list_waitlist' },
    status: { type: String, default: 'waitlisted' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'waitlists', timestamps: true }
)

export const WaitlistSubmission: Model<IWaitlist> =
  (mongoose.models.WaitlistSubmission as Model<IWaitlist> | undefined) ||
  mongoose.model<IWaitlist>('WaitlistSubmission', WaitlistSchema)

/* -------------------------------------------------------------
 * 2. Bulk Order / Hospitality Schema & Model (collection: 'bulk_orders')
 * ------------------------------------------------------------*/
export interface IBulkOrder {
  name: string
  email: string
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
  (mongoose.models.BulkOrderSubmission as Model<IBulkOrder> | undefined) ||
  mongoose.model<IBulkOrder>('BulkOrderSubmission', BulkOrderSchema)

/* -------------------------------------------------------------
 * 3. General Contact Schema & Model (collection: 'contacts')
 * ------------------------------------------------------------*/
export interface IContactMessageDoc {
  name: string
  email: string
  message: string
  source: string
  status: string
  createdAt: Date
}

const ContactMessageSchema = new mongoose.Schema<IContactMessageDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, default: '', trim: true },
    source: { type: String, default: 'general_contact' },
    status: { type: String, default: 'new_message' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'contacts', timestamps: true }
)

export const ContactMessageSubmission: Model<IContactMessageDoc> =
  (mongoose.models.ContactMessageSubmission as Model<IContactMessageDoc> | undefined) ||
  mongoose.model<IContactMessageDoc>('ContactMessageSubmission', ContactMessageSchema)

/* -------------------------------------------------------------
 * 4. Unified All Submissions (collection: 'all_submissions')
 * ------------------------------------------------------------*/
export interface IContactSubmission {
  kind: ContactKind
  name: string
  email: string
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
    city: { type: String, default: '', trim: true },
    business: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'all_submissions', timestamps: true }
)

export const ContactSubmission: Model<IContactSubmission> =
  (mongoose.models.ContactSubmission as Model<IContactSubmission> | undefined) ||
  mongoose.model<IContactSubmission>('ContactSubmission', ContactSubmissionSchema)

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
  const results = await Promise.allSettled([
    WaitlistSubmission.findByIdAndDelete(id),
    BulkOrderSubmission.findByIdAndDelete(id),
    ContactMessageSubmission.findByIdAndDelete(id),
    ContactSubmission.findByIdAndDelete(id),
  ])
  return results.some((r) => r.status === 'fulfilled' && Boolean(r.value))
}


