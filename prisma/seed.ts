import "dotenv/config"
import { PrismaClient, Prisma } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Seeding invoices database...")

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "TotpRecoveryCode",
    "ChatMessageAttachment", "ChatMessage", "ChatThread",
    "FileAsset", "InvoiceLine", "RecurringInvoice", "Invoice",
    "Template", "Setting", "TaxRate", "Contact", "User",
    "OAuthAccount", "UserInvitation", "VerificationToken",
    "DurableJob", "JobAttempt", "WebhookEvent", "RateLimitBucket"
    RESTART IDENTITY CASCADE`)

  const locale = process.env.SEED_LANGUAGE === "de" ? "de" : "en"

  const taxRates = [
    { jurisdiction: "DE", name: "MwSt 19%", rate: 0.19, taxType: "STANDARD", description: "German VAT standard rate" },
    { jurisdiction: "DE", name: "MwSt 7%", rate: 0.07, taxType: "REDUCED", description: "German VAT reduced rate" },
    { jurisdiction: "AT", name: "USt 20%", rate: 0.2, taxType: "STANDARD" },
    { jurisdiction: "US-CA", name: "Sales Tax 8.25%", rate: 0.0825, taxType: "STANDARD" },
  ]

  await prisma.taxRate.createMany({ data: taxRates as Prisma.TaxRateCreateManyInput[] })
  console.log(`Seeded ${taxRates.length} tax rates`)

  const defaultSettings = [
    { key: "company.name", value: { value: locale === "de" ? "Muster GmbH" : "Acme GmbH" } },
    { key: "companyName", value: locale === "de" ? "Muster GmbH" : "Acme GmbH" },
    { key: "baseCurrency", value: { value: "EUR" } },
    { key: "defaultTaxJurisdiction", value: { value: "DE" } },
    { key: "company.defaultLanguage", value: { value: locale } },
  ]

  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as Prisma.InputJsonValue },
      create: { key: s.key, value: s.value as Prisma.InputJsonValue },
    })
  }
  console.log(`Seeded ${defaultSettings.length} settings`)

  await prisma.contact.create({
    data: {
      name: locale === "de" ? "Beispiel Kunde" : "Sample Customer",
      type: "CUSTOMER",
      email: "customer@example.com",
      currency: "EUR",
      preferredLanguage: locale,
    },
  })
  console.log("Seeded sample contact")
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
