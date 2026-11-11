# Deploying Study Space on Oracle Cloud (Always Free)

One VM runs everything: the site (static files), the game server, HTTPS and the
voice relay. Caddy serves the site and proxies the game API and WebSocket to
the Node server, so the browser talks to a single address and there is no
cross-origin setup.

```
browser ──https/wss──> Caddy :443 ──> static client files
                                 └──> Node game server 127.0.0.1:2567
browser <──voice audio (direct, peer to peer)──> browser
browser ──udp/tcp──> coturn :3478   (only when a direct link is impossible)
```

## What only you can do (about 20 minutes)

### 1. Account
Sign up at cloud.oracle.com. Choose the **home region** carefully: it cannot be
changed and Always Free resources live there. Pick one near your players. A card
is needed for verification. Upgrading to pay-as-you-go (still free inside the
Always Free limits) lowers the chance that Oracle reclaims an idle VM.

### 2. Create the VM
Compute → Instances → Create instance:
- Image: **Ubuntu 24.04** (or 22.04).
- Shape: **VM.Standard.A1.Flex** (Arm), 1 OCPU and 6 GB RAM is plenty. If it
  says "out of capacity", retry later or try another availability domain. The
  AMD micro shape (`VM.Standard.E2.1.Micro`, 1 GB) also works.
- Add your SSH public key (or download the one Oracle generates).
- Keep the default network (a public subnet with a public IP).

### 3. Open ports in the cloud network
Networking → Virtual cloud networks → your VCN → the subnet's **Security List**
→ Add ingress rules, source `0.0.0.0/0`:

| Protocol | Port(s) | For |
| --- | --- | --- |
| TCP | 80 | HTTPS certificate issuing and redirect |
| TCP | 443 | The site and game |
| TCP | 3478 | Voice relay |
| UDP | 3478 | Voice relay |
| UDP | 49152-49351 | Voice relay media |

Port 22 (SSH) is open already. The setup script opens the same ports in the
VM's own firewall; Oracle's Ubuntu images block them there too.

### 4. Reserve the public IP (recommended)
Networking → IP management → Reserved public IPs → create one and attach it to
the VM's network interface. Otherwise the address can change when the VM is
recreated, and your HTTPS name changes with it.

### 5. Run the setup script
```bash
ssh ubuntu@<public-ip>
git clone <your repo url> study-space-setup && cd study-space-setup/deploy/oracle
REPO_URL=<your repo url> bash setup.sh
```
- The repository must be reachable from the VM. A public GitHub repo works as
  is; a private one needs a deploy key or token in the URL.
- This must be on a branch that contains the `deploy/` folder (merge or push
  first). Use `BRANCH=<name>` if it is not `main`.
- With no domain of your own it uses `<ip-with-dashes>.sslip.io`, a free name
  that points at your IP, and Caddy gets a real certificate for it. To use your
  own domain, point an A record at the IP first and run with
  `DOMAIN=play.example.com`.

When it finishes, open `https://<domain>`.

## Checking it works

```bash
curl -s https://<domain>/health     # {"ok":true}
curl -s https://<domain>/api/ice    # STUN plus a turn: entry with credentials
systemctl status study-space caddy coturn
journalctl -u study-space -f        # game server log
```

For voice, open the site in two browsers (different networks if possible),
join the same server, click **Join voice** in both and allow the microphone.

## Updating

After pushing to the branch, on the VM:

```bash
bash /opt/study-space/deploy/oracle/update.sh
```

This restarts the game server, which ends everyone's current session (the world
is held in memory), so do it when nobody is studying.

## Things worth knowing

- **One server process only.** Rooms live in memory; do not run two copies.
- **Settings** are in `/etc/study-space.env`: `TURN_HOST` and `TURN_SECRET`
  feed `/api/ice` and must match `/etc/turnserver.conf`. Setup keeps the
  existing secret on re-runs.
- **Voice relay limits:** the relay is only used when two people cannot connect
  directly. It is set to refuse relaying into private networks and caps usage
  per user.
- **Idle reclaim:** Oracle can reclaim an Always Free VM that stays almost idle
  for a week. Check the VM now and then, and consider the pay-as-you-go upgrade.
- **Backups:** nothing persistent lives on the VM (no database yet), so a
  rebuild is just running `setup.sh` again.
- Nothing here was run against a real Oracle VM before you; if a step fails,
  the script prints which one, and re-running it is safe.
