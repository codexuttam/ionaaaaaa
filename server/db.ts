import mongoose, { type Model } from 'mongoose'
import type { ContactKind, ContactMessage } from './contact.ts'

export interface IContactSubmission {
  kind: ContactKind
  name: string
  email: string
  city?: string
  business?: string
  message?: string
  createdAt: Date
}

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
  { timestamps: true }
)

export const ContactSubmission: Model<IContactSubmission> =
  (mongoose.models.ContactSubmission as Model<IContactSubmission> | undefined) ||
  mongoose.model<IContactSubmission>('ContactSubmission', ContactSubmissionSchema)

export async function saveContactSubmission(
  message: ContactMessage,
  mongoUri?: string
): Promise<IContactSubmission> {
  await connectDB(mongoUri)
  return await ContactSubmission.create({
    kind: message.kind,
    name: message.name,
    email: message.email,
    city: message.city,
    business: message.business,
    message: message.message,
    createdAt: new Date(),
  })
}
