# Deploying PRESS Journals — Oracle Cloud Always Free (no cost, forever)

The app runs in Docker on a free Oracle Cloud VM. Total hands-on time: ~20 minutes,
most of it clicking through Oracle's signup. After that, updates are one command.

## Part A — Create the free VM (one time, in the browser)

1. **Sign up** at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
   A credit card is required for identity verification but is **never charged** —
   Always Free resources don't expire and can't accrue charges.
   Pick a home region close to you (e.g. *US East (Ashburn)*).

2. **Create the VM**: Console menu → Compute → Instances → **Create instance**
   - Name: `press-journals`
   - Image: **Ubuntu 24.04** (click "Change image" — Canonical Ubuntu)
   - Shape: click "Change shape" → **Ampere (Arm)** → `VM.Standard.A1.Flex`,
     1 OCPU / 6 GB RAM (well inside the free allowance)
     - **If Arm shows "out of capacity"**: use the AMD fallback. Under the **AMD**
       tab pick **`VM.Standard.E2.1.Micro`** — this is the *only* Always-Free AMD
       shape. **Do NOT pick E5.Flex / E4.Flex / E3.Flex — those are PAID and will
       charge your card.** If you only see E5/E4, look under "Specialty and
       previous generation" or filter for the **"Always Free eligible"** tag.
       The setup script auto-adds swap so the 1 GB Micro shape runs fine.
   - Networking: keep the defaults ("Create new virtual cloud network"), and make
     sure **"Assign a public IPv4 address" is checked**
   - SSH keys: choose **Generate a key pair for me** → download the private key
   - Click **Create**, wait ~1 min, copy the **Public IP address**

3. **Open web ports** (Oracle blocks them by default):
   - On the instance page click its subnet → the **Default Security List**
   - **Add Ingress Rules** — add two rules, both with Source CIDR `0.0.0.0/0`,
     IP Protocol TCP: one with destination port `80`, one with port `443`

4. *(Optional but recommended — enables HTTPS)* **Free domain**: go to
   [duckdns.org](https://www.duckdns.org), sign in, create a subdomain like
   `pressjournals.duckdns.org`, and set its IP to the VM's public IP.

## Part B — Install the app (one command)

SSH into the VM from your Mac's terminal (use the key you downloaded):

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

Then on the VM, run:

```bash
export ADMIN_PASSWORD='choose-a-strong-password'
export APP_DOMAIN='pressjournals.duckdns.org'   # omit this line if you skipped DuckDNS
curl -fsSL https://raw.githubusercontent.com/ellayee168-create/press-journals-app/main/deploy/setup-server.sh | bash
```

That installs Docker, builds the app, starts it with a persistent data volume,
and puts a Caddy proxy in front (with automatic HTTPS when APP_DOMAIN is set).

When email is ready, add the SMTP exports before re-running:

```bash
export SMTP_HOST=smtp.resend.com SMTP_PORT=587 SMTP_USER=resend SMTP_PASS=<key> SMTP_FROM=journal@yourdomain.org
```

## Updating the app later

Push changes to GitHub, then on the VM re-run the same install command
(with the same exports). Data is preserved — it lives on the `press-data`
Docker volume, not in the container.

## Backups

Everything (database + uploads) is in one Docker volume. To back it up from your Mac:

```bash
ssh -i <key> ubuntu@<IP> 'sudo docker run --rm -v press-data:/d alpine tar cz -C /d .' > press-backup-$(date +%F).tar.gz
```

Worth running after each submission deadline.

## Notes

- The setup script is **idempotent** — re-running it is always safe.
- The container restarts automatically if the VM reboots (`--restart unless-stopped`).
- The GitHub repo must be public for the VM to clone it (it contains no secrets —
  all credentials come from environment variables at runtime).
