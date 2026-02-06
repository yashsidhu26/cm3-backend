# Gmail Setup Script

Interactive shell script to create a user account (or sign in) and connect their Gmail.

## Usage

```bash
./scripts/setup-gmail.sh
```

## What it does

1. **Prompts for Authentication Method**:
   - Choose between **Sign Up** (creates new account) or **Sign In** (existing account)

2. **Collects Credentials**:
   - For Sign Up: Name, Email, Password (with confirmation)
   - For Sign In: Email, Password

3. **Authenticates User**:
   - Creates account (if Sign Up selected)
   - Signs in and gets session session cookie (handled automatically)

4. **Displays Gmail OAuth URL** for you to open in browser

5. **Prompts for authorization code** from the callback URL

6. **Saves Gmail tokens** to the database

7. **Verifies connection** and displays connected Gmail email

## Example Flow

```
$ ./scripts/setup-gmail.sh

╔══════════════════════════════════════════╗
║     Gmail Auth Setup Script             ║
╚══════════════════════════════════════════╝

Step 1: Authentication Method
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1) Sign Up (New Account)
2) Sign In (Existing Account)
Choose an option (1 or 2): 2

Step 2: User Information
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enter user's email: john@example.com
Enter password: ********

Step 3b: Signing In
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Signed in successfully!

Step 4: Getting Gmail OAuth URL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Gmail OAuth URL retrieved!

Step 5: Connect Gmail Account
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please open this URL in your browser to authorize Gmail:

https://accounts.google.com/o/oauth2/v2/auth?...

After authorizing, you'll be redirected to a callback URL.
Copy the 'code' parameter from the callback URL.

Example callback URL:
  http://localhost:3000/auth/callback?code=4/0AY0e-g7...
                                      ^^^^^^^^^^^^^ (copy this part)

Enter the authorization code: 4/0AY0e-g7...

Step 6: Saving Gmail Tokens
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Gmail tokens saved successfully!

Step 7: Verifying Gmail Connection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Gmail connection verified!
Connected Gmail: john.doe@gmail.com

╔══════════════════════════════════════════╗
║          Setup Complete! ✓               ║
╚══════════════════════════════════════════╝

User Details:
  Name:  John Doe (if available)
  Email: john@example.com
  
Gmail Connection:
  Status: Connected
  Email:  john.doe@gmail.com

You can now use this account to access Gmail API!
```

## Requirements

- Server must be running (`bun run dev`)
- Gmail OAuth credentials configured in `.env`
- `curl` command available

## Environment Variables

The script uses `API_URL` environment variable (defaults to `http://localhost:3000`):

```bash
API_URL=http://localhost:3000 ./scripts/setup-gmail.sh
```

## Troubleshooting

### "Failed to create user account"
- Check if the email is already registered
- Verify the server is running
- Check server logs for errors

### "Failed to get Gmail OAuth URL"
- Ensure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REDIRECT_URI` are set in `.env`
- Verify the user is signed in (session cookie is valid)

### "Failed to save Gmail tokens"
- Make sure you copied the entire authorization code
- Check that the code hasn't expired (they expire quickly)
- Verify the callback URL matches `GMAIL_REDIRECT_URI` in `.env`
