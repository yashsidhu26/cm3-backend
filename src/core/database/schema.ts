/**
 * Central schema export file
 * All table schemas from modules are re-exported here
 * This ensures Drizzle can track all tables for migrations
 */

// Authentication tables (Better Auth)
export * from '../../modules/auth/auth.schema';

// Module schemas
export * from '../../modules/academics/academics.schema';
export * from '../../modules/social/social.schema';
export * from '../../modules/gmail-auth/gmail-auth.schema';
export * from '../../modules/payments/payments.schema';
