import { useState } from 'react';
import {
  Shield, Wallet, FileText, KeyRound, AlertTriangle, CheckCircle2,
  Trash2, ExternalLink, Activity, Lock, RefreshCw, Copy, Check
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:3001/api`;

interface WalletInfo {
  address: string;
  did: string;
}

interface WalletsState {
  patient: WalletInfo;
  trustee: WalletInfo;
  hospital: WalletInfo;
}

interface MintedDAT {
  nfTokenID: string;
  txHash: string;
  explorerUrl: string;
  cid: string;
  hash: string;
  shares: { patient: string; trustee: string; hospital: string };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'patient' | 'er'>('patient');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // XRPL Wallets
  const [wallets, setWallets] = useState<WalletsState | null>(null);

  // Patient FHIR Directive Form
  const [directive, setDirective] = useState({
    resourceType: 'Consent',
    patientName: 'Mario Rossi (DOB: 1948-04-12)',
    trusteeName: 'Dr. Elena Bianchi (Legal Trustee)',
    artificialNutrition: false,
    invasiveVentilation: false,
    palliativeSedation: true,
    organDonation: true,
  });

  // Minted Token State
  const [minted, setMinted] = useState<MintedDAT | null>(null);
  const [revokedTx, setRevokedTx] = useState<{ burnTxHash: string; explorerUrl: string } | null>(null);

  // ER Console State
  const [erCredentials, setErCredentials] = useState({ nfTokenID: '', shareA: '', shareB: '' });
  const [simulateTampering, setSimulateTampering] = useState(false);
  const [erResult, setErResult] = useState<any>(null);
const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };
  // AI Act Human-in-the-Loop State


  const handleSetupWallets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/setup-wallets`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fund Testnet wallets');
      setWallets(data.wallets);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMintDAT = async () => {
    setLoading(true);
    setError(null);
    setRevokedTx(null);
    setErResult(null);
    try {
      const res = await fetch(`${API_URL}/dat/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(directive),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Minting failed');
      setMinted(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyER = async () => {
    const { nfTokenID, shareA, shareB } = erCredentials;
    if (!nfTokenID.trim() || !shareA.trim() || !shareB.trim()) {
      setError('Enter the NFToken ID and two secret shares to verify the directive.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/dat/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfTokenID: nfTokenID.trim(),
          shareA: shareA.trim(),
          shareB: shareB.trim(),
          simulateTampering,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setErResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!minted) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/dat/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfTokenID: minted.nfTokenID }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Revocation failed');
      setRevokedTx({ burnTxHash: data.burnTxHash, explorerUrl: data.explorerUrl });
      setMinted(null);
      setErResult(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 border border-blue-500/40 rounded-lg">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">DAT-Token</h1>
              <p className="text-xs text-slate-400">Advance Healthcare Directives (RWAs) on XRPL Testnet</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              XRPL Testnet Live
            </span>
            <button
              onClick={handleSetupWallets}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              {wallets ? 'Wallets Active (3 SSI DIDs)' : 'Initialize SSI Wallets'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('patient')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
              activeTab === 'patient' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" /> 1. Patient Portal (XLS-20 & SSI)
          </button>
          <button
            onClick={() => setActiveTab('er')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
              activeTab === 'er' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" /> 2. ER Emergency Console (Break-the-Glass)
          </button>
        </div>

        {/* TAB 1: PATIENT PORTAL */}
        {activeTab === 'patient' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" /> HL7 FHIR Advance Directive (Law 219/2017)
              </h2>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-slate-400 mb-1">Patient Identity</label>
                  <input
                    type="text"
                    value={directive.patientName}
                    onChange={(e) => setDirective({ ...directive, patientName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Legal Trustee (Fiduciario)</label>
                  <input
                    type="text"
                    value={directive.trusteeName}
                    onChange={(e) => setDirective({ ...directive, trusteeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100"
                  />
                </div>

                <div className="pt-2 space-y-2">
                  {[
                    { key: 'cprResuscitation', label: 'Consent to Cardiopulmonary Resuscitation (CPR)' },
                    { key: 'bloodTransfusion', label: 'Consent to Blood Transfusions & Blood Products' },
                    { key: 'artificialNutrition', label: 'Consent to Artificial Nutrition & Hydration' },
                    { key: 'invasiveVentilation', label: 'Consent to Invasive Mechanical Ventilation' },
                    { key: 'palliativeSedation', label: 'Request Continuous Deep Palliative Sedation' },
                    { key: 'organDonation', label: 'Consent to Post-Mortem Organ Donation' },
                    { key: 'bodyDonationResearch', label: 'Consent to Post-Mortem Body Donation for Research' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                      <span>{item.label}</span>
                      <input
                        type="checkbox"
                        checked={(directive as any)[item.key]}
                        onChange={(e) => setDirective({ ...directive, [item.key]: e.target.checked })}
                        className="w-4 h-4 accent-blue-500"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleMintDAT}
                disabled={!wallets || loading}
                className="w-full py-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition"
              >
                {loading ? 'Encrypting & Minting on XRPL Testnet...' : 'Encrypt Off-Chain & Mint XLS-20 Soulbound Token'}
              </button>
            </div>

            {/* Right Panel: On-Chain Status & Shamir Shares */}
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" /> XRPL Notarization & Shamir 2-of-3 Shares
              </h2>

              {!minted && !revokedTx && (
                <p className="text-sm text-slate-400">
                  1. Click <strong>Initialize SSI Wallets</strong> in the header.<br />
                  2. Configure the HL7 FHIR directives and click <strong>Mint XLS-20 Soulbound Token</strong>.
                </p>
              )}

              {revokedTx && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm space-y-2">
                  <p className="font-semibold">GDPR Art. 17 Revocation Complete (Burn + Crypto-Shredding)</p>
                  <a href={revokedTx.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 underline">
                    View NFTokenBurn on XRPL Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {minted && (
                <div className="space-y-4 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-950 border border-emerald-500/40 space-y-1">
                    <div className="text-emerald-400 font-sans font-semibold text-sm flex items-center justify-between">
                      <span>XLS-20 Soulbound Token Active</span>
                      <a href={minted.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 underline">
                        XRPL Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="flex items-start justify-between gap-2">
  <p className="font-mono text-xs text-slate-300 break-all">
    <span className="text-slate-400">NFTokenID:</span> {minted.nfTokenID}
  </p>
  <button
    type="button"
    onClick={() => handleCopy('nft', minted.nfTokenID)}
    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
  >
    {copiedKey === 'nft' ? (
      <>
        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
      </>
    ) : (
      <>
        <Copy className="w-3.5 h-3.5" /> Copy
      </>
    )}
  </button>
</div>
                    <p className="truncate text-slate-400">IPFS CID: {minted.cid}</p>
                    <p className="truncate text-slate-400">SHA-256: {minted.hash}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-sans text-xs font-semibold text-slate-300">Shamir's Secret Sharing (2-of-3 Key Fragments):</p>
                    {[
  { id: 'share1', label: 'Share 1 (Patient):', color: 'text-blue-400', value: minted.shares.patient },
  { id: 'share2', label: 'Share 2 (Trustee):', color: 'text-emerald-400', value: minted.shares.trustee },
  { id: 'share3', label: 'Share 3 (Hospital):', color: 'text-amber-400', value: minted.shares.hospital },
].map((s) => (
  <div
    key={s.id}
    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-2"
  >
    <p className="font-mono text-xs text-slate-200 break-all">
      <span className={`${s.color} font-semibold`}>{s.label}</span> {s.value}
    </p>
    <button
      type="button"
      onClick={() => handleCopy(s.id, s.value)}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
    >
      {copiedKey === s.id ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" /> Copy
        </>
      )}
    </button>
  </div>
))}
                  </div>

                  <button
                    onClick={handleRevoke}
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg font-sans font-semibold text-sm bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Revoke Directive (NFTokenBurn + Crypto-Shredding)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ER EMERGENCY CONSOLE */}
        {activeTab === 'er' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Emergency Room Break-the-Glass Console</h2>
                <p className="text-sm text-slate-400">
                  Patient is unconscious. Enter the patient's NFToken ID and any two secret shares provided to you. This console does not use patient-portal data.
                </p>
              </div>
              <label className="flex items-center gap-3 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateTampering}
                  onChange={(e) => setSimulateTampering(e.target.checked)}
                  className="w-4 h-4 accent-red-500"
                />
                <span className="text-sm font-medium text-red-300">Simulate Off-Chain Tampering Attack</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Minted NFToken ID</span>
                <input
                  type="text"
                  value={erCredentials.nfTokenID}
                  onChange={(e) => {
                    setErCredentials({ ...erCredentials, nfTokenID: e.target.value });
                    setErResult(null);
                  }}
                  placeholder="Paste the NFToken ID"
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Secret share A</span>
                <textarea
                  value={erCredentials.shareA}
                  onChange={(e) => {
                    setErCredentials({ ...erCredentials, shareA: e.target.value });
                    setErResult(null);
                  }}
                  placeholder="Paste one share (for example, 1:...)"
                  rows={2}
                  disabled={loading}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-slate-300">Secret share B</span>
                <textarea
                  value={erCredentials.shareB}
                  onChange={(e) => {
                    setErCredentials({ ...erCredentials, shareB: e.target.value });
                    setErResult(null);
                  }}
                  placeholder="Paste a different share (for example, 2:...)"
                  rows={2}
                  disabled={loading}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
                />
              </label>
              <p className="text-xs text-slate-400 md:col-span-3">
                Enter each complete share, including its 1:, 2:, or 3: prefix. You can paste the share together with its Patient, Trustee, or Hospital label.
              </p>
            </div>

            <button
              onClick={handleVerifyER}
              disabled={loading || !erCredentials.nfTokenID.trim() || !erCredentials.shareA.trim() || !erCredentials.shareB.trim()}
              className="px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition"
            >
              {loading ? 'Reconstructing Key & Verifying on XRPL...' : 'Decrypt & Verify Against XRPL Ledger'}
            </button>

            {erResult && erResult.verified && (
              <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-5 h-5" /> 100% Cryptographic Integrity Verified Against XRPL
                </div>
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-semibold text-slate-200">Verified advance directive</p>
                 {/* Intestazione Paziente e Fiduciario */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-xs uppercase tracking-wider text-slate-400 block">Patient</span>
                    <span className="text-sm font-semibold text-white">{erResult.directive.patientName}</span>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800">
                    <span className="text-xs uppercase tracking-wider text-slate-400 block">Legal Trustee (Fiduciario)</span>
                    <span className="text-sm font-semibold text-white">{erResult.directive.trusteeName}</span>
                  </div>
                </div>

                {/* Griglia Direttive Cliniche ad alto contrasto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: 'cprResuscitation', label: 'CPR / Resuscitation', yes: 'CONSENT', no: 'DNR (REFUSED)' },
                    { key: 'bloodTransfusion', label: 'Blood Transfusions', yes: 'CONSENT', no: 'REFUSED' },
                    { key: 'artificialNutrition', label: 'Artificial Nutrition & Hydration', yes: 'CONSENT', no: 'REFUSED' },
                    { key: 'invasiveVentilation', label: 'Invasive Mechanical Ventilation', yes: 'CONSENT', no: 'REFUSED' },
                    { key: 'palliativeSedation', label: 'Deep Palliative Sedation', yes: 'REQUESTED', no: 'NO' },
                    { key: 'organDonation', label: 'Post-Mortem Organ Donation', yes: 'CONSENT', no: 'REFUSED' },
                    { key: 'bodyDonationResearch', label: 'Body Donation for Research', yes: 'CONSENT', no: 'REFUSED' },
                  ]
                    .filter((item) => erResult.directive[item.key] !== undefined)
                    .map((item) => {
                      const allowed = Boolean(erResult.directive[item.key]);
                      return (
                        <div
                          key={item.key}
                          className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950 border border-slate-800"
                        >
                          <span className="text-sm text-slate-200 font-medium">{item.label}</span>
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide border ${
                              allowed
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                : 'bg-red-500/15 text-red-300 border-red-500/40'
                            }`}
                          >
                            {allowed ? item.yes : item.no}
                          </span>
                        </div>
                      );
                    })}
                </div>

                {/* JSON FHIR tecnico richiudibile per i giudici */}
                <details className="pt-2">
                  <summary className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                    Inspect Raw HL7 FHIR JSON ({erResult.directive.resourceType})
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 overflow-x-auto">
                    {JSON.stringify(erResult.directive, null, 2)}
                  </pre>
                </details>
                </div>
              </div>
            )}

            {erResult && erResult.tampered && (
              <div className="p-5 rounded-xl bg-red-500/10 border border-red-500/50 space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-bold">
                  <AlertTriangle className="w-5 h-5" /> {erResult.message}
                </div>
                <p className="text-sm text-slate-300">
                  An immutable <code className="text-red-300">SECURITY_ALERT_HASH_MISMATCH</code> transaction has been broadcast to XRPL Testnet.
                </p>
                <a href={erResult.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-400 underline">
                  Inspect Forensic Alert on XRPL Explorer <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        )}

        
      </main>
    </div>
  );
}