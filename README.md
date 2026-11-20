# DAT-Token — Tokenizing Advance Healthcare Directives on XRPL

**IXH26 Bari — Tokenization Challenge (XRPL Applications Track)**  
*Turn real-world medico-legal value into cryptographically verifiable tokens people can trust.*

---

## Overview

**DAT-Token** tokenizes Advance Healthcare Directives (Living Wills / Italian *DAT — Law 219/2017*) as non-financial Real-World Assets (RWAs) on the **XRP Ledger (XRPL) Testnet**.

Current Electronic Health Records (EHRs) act as centralized Single Points of Failure, vulnerable to cyberattacks and unauthorized retrospective alterations. DAT-Token provides a **Hybrid Privacy-by-Design** architecture that guarantees patient sovereignty and a tamper-proof forensic chain of custody for hospitals and clinicians—without ever exposing sensitive clinical data on-chain.

---

## Architecture & Cryptographic Primitives

1. **Zero PII/PHI On-Chain (AES-256-GCM + Off-Chain Storage):**
   - Clinical directives (structured in **HL7 FHIR `Consent`** format) are encrypted with **AES-256-GCM** and stored off-chain (simulating a private hospital IPFS cluster).
   - Only the cryptographic commitment (`ipfs://<CID>#sha256=<hash>`) is anchored on XRPL.
2. **XRPL Native Layer-1 Primitives (No Smart Contracts):**
   - **XLS-20 Soulbound Token (SBT):** Minted with `tfBurnable` enabled and `tfTransferable` disabled (`Flags: 1`), binding the directive permanently to the patient's account while remaining legally revocable.
   - **Self-Sovereign Identity (DIDs):** Distinct Testnet identities (`did:xrpl:testnet:<address>`) for Patient, Legal Trustee (*Fiduciario*), and Hospital Node.
3. **Break-the-Glass Emergency Access (Shamir's Secret Sharing 2-of-3):**
   - Solves the *"Unconscious Patient Paradox"*: when a patient arrives in the ER in a coma, they cannot sign with their private key.
   - The 256-bit AES decryption key is split over $GF(256)$ into 3 shares (**Patient**, **Legal Trustee**, **Hospital Node**) with a **2-of-3 threshold**, allowing Trustee + Hospital to reconstruct the key in emergencies.
4. **GDPR Art. 17 Compliance (Burn-and-Mint + Crypto-Shredding):**
   - Patients can revoke or update directives at any time via `NFTokenBurn` on XRPL paired with off-chain destruction of encryption keys.
5. **Tamper-Proof Verifier Gateway & Forensic Audit Trail:**
   - Upon ER decryption, the gateway recomputes the SHA-256 hash and verifies it against the on-chain XLS-20 URI.
   - If off-chain tampering is detected, clinical display is blocked and an immutable `SECURITY_ALERT_HASH_MISMATCH` memo transaction is broadcast to XRPL Testnet.

---

## Repository Structure

```text
dat-token-xrpl/
├── backend/          # Node.js + Express REST API, xrpl.js, AES-256-GCM, Shamir 2-of-3
├── frontend/         # React + TypeScript + Vite + Tailwind CSS dashboard
└── README.md         # Documentation & AI Disclosure