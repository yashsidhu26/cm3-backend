# PostgreSQL Setup Guide for macOS

## 🔍 Your Current Setup

- **System User:** `yash`
- **PostgreSQL Version:** 17.5 (Homebrew)
- **Installation Path:** `/opt/homebrew/opt/postgresql@17`

## 📋 Finding Your PostgreSQL Username

On macOS with Homebrew PostgreSQL, the default superuser is typically **your system username** (`yash`), not `postgres`.

### Check Current User

```bash
# Method 1: Try connecting with your username
psql -U yash -d postgres -c "SELECT current_user;"

# Method 2: List all users
psql -d postgres -c "\du"

# Method 3: Check who can connect
psql -l
```

## 🔐 Reset PostgreSQL Password

### Option 1: Reset Password for Your User (yash)

```bash
# Connect to PostgreSQL
psql -d postgres

# Inside psql, run:
ALTER USER yash WITH PASSWORD 'your_new_password';

# Exit psql
\q
```

### Option 2: Create/Reset Postgres User

If you want to use `postgres` as the username:

```bash
# Connect as superuser (your username)
psql -d postgres

# Create postgres user if it doesn't exist
CREATE USER postgres WITH SUPERUSER PASSWORD 'your_password';

# Or if it exists, reset password
ALTER USER postgres WITH PASSWORD 'your_password';

# Exit
\q
```

### Option 3: Using psql Command Line

```bash
# Reset password without entering psql
psql -d postgres -c "ALTER USER yash WITH PASSWORD 'your_new_password';"
```

## 🚀 Quick Setup Commands

### 1. Check PostgreSQL Status

```bash
# Check if PostgreSQL is running
brew services list | grep postgres

# Start PostgreSQL if not running
brew services start postgresql@17
```

### 2. Connect to PostgreSQL

```bash
# Connect with your username (default on macOS)
psql -d postgres

# Or specify username
psql -U yash -d postgres
```

### 3. Create Database for Super App

```bash
# Connect to PostgreSQL
psql -d postgres

# Create database
CREATE DATABASE super_app;

# Create user (optional)
CREATE USER superapp_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE super_app TO superapp_user;

# Exit
\q
```

### 4. Update Your .env File

After setting up, update `.env`:

```env
# Option 1: Use your system username
DATABASE_URL=postgresql://yash:your_password@localhost:5432/super_app

# Option 2: Use postgres user (if created)
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/super_app
```

## 🔧 Troubleshooting

### "role does not exist" Error

This means the user doesn't exist. Create it:

```bash
psql -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'your_password';"
```

### "database does not exist" Error

Create the database:

```bash
psql -d postgres -c "CREATE DATABASE super_app;"
```

### "connection refused" Error

PostgreSQL service is not running:

```bash
# Start PostgreSQL
brew services start postgresql@17

# Check status
brew services list | grep postgres
```

### "password authentication failed"

Reset the password using one of the methods above.

## 📝 Common Commands Reference

```bash
# List all databases
psql -l

# List all users
psql -d postgres -c "\du"

# Connect to specific database
psql -d super_app

# Show current user
psql -d postgres -c "SELECT current_user;"

# Show version
psql --version

# Start PostgreSQL service
brew services start postgresql@17

# Stop PostgreSQL service
brew services stop postgresql@17

# Restart PostgreSQL service
brew services restart postgresql@17
```

## 🎯 Recommended Setup for Super App

### Step 1: Ensure PostgreSQL is Running

```bash
brew services start postgresql@17
```

### Step 2: Connect and Check

```bash
psql -d postgres -c "SELECT version();"
```

### Step 3: Create Database (if needed)

```bash
psql -d postgres -c "CREATE DATABASE super_app;"
```

### Step 4: Update .env

```env
DATABASE_URL=postgresql://yash:your_password@localhost:5432/super_app
```

### Step 5: Test Connection

```bash
psql $DATABASE_URL -c "SELECT 1;"
```

---

**Note:** On macOS with Homebrew, the default PostgreSQL superuser is your system username (`yash`), not `postgres`.
