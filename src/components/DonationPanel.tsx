import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, HeartHandshake, ShieldCheck, Wallet } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface DonationPanelProps {
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

const donationWallets = [
  {
    id: 'btc',
    symbol: 'BTC',
    network: 'Bitcoin',
    address: 'bc1qqsuljwzs32ckkqdrsdus7wgqzuetty3g0x47l7',
  },
  {
    id: 'eth',
    symbol: 'ETH',
    network: 'Ethereum',
    address: '0x4bd17Cc073D08E3E021Fd315d840554c840843E1',
  },
  {
    id: 'usdt-eth',
    symbol: 'USDT',
    network: 'Ethereum / ERC-20',
    address: '0x4bd17Cc073D08E3E021Fd315d840554c840843E1',
  },
  {
    id: 'sol',
    symbol: 'SOL',
    network: 'Solana',
    address: '81H1rKZHjpSsnr6Epumw9XVTfqAnqSHcTKm7D3VsEd74',
  },
  {
    id: 'xrp',
    symbol: 'XRP',
    network: 'XRP Ledger',
    address: 'rfXzWPGKFMGdaYsqFCiyZHhRXF741Snx8N',
  },
  {
    id: 'trx',
    symbol: 'TRX',
    network: 'TRON',
    address: 'TQBz3q8Ddjap3K8QdFQHtJKBxbvXMCi62E',
  },
  {
    id: 'bch',
    symbol: 'BCH',
    network: 'Bitcoin Cash',
    address: 'qzfd46kp4tguu8pxrs6gnux0qxndhnqk8sa83q08wm',
  },
  {
    id: 'ltc',
    symbol: 'LTC',
    network: 'Litecoin',
    address: 'LZC3egqj1K9aZ3i42HbsRWK7m1SbUgXmak',
  },
  {
    id: 'xtz',
    symbol: 'XTZ',
    network: 'Tezos',
    address: 'tz1Tij1ujzkEyvA949x1q7EW17s6pUNbEUdV',
  },
] as const;

export default function DonationPanel({ copiedField, onCopyText }: DonationPanelProps) {
  const { t } = useLanguage();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function generateQrCodes() {
      const entries = await Promise.all(
        donationWallets.map(async (wallet) => {
          const dataUrl = await QRCode.toDataURL(wallet.address, {
            errorCorrectionLevel: 'M',
            margin: 1,
            scale: 5,
            color: {
              dark: '#121412',
              light: '#f4f6ef',
            },
          });
          return [wallet.id, dataUrl] as const;
        }),
      );

      if (!cancelled) {
        setQrCodes(Object.fromEntries(entries));
      }
    }

    generateQrCodes().catch(() => {
      if (!cancelled) {
        setQrCodes({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <div className="surface-panel p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl items-start gap-4">
            <div className="icon-tile h-12 w-12 shrink-0 text-brand-primary">
              <HeartHandshake className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-primary">
                {t('donate.eyebrow')}
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold text-on-surface">
                {t('donate.title')}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface-variant">
                {t('donate.subtitle')}
              </p>
            </div>
          </div>

          <div className="surface-card flex min-w-[220px] items-center gap-3 rounded-lg p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-brand-tertiary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface">
                {t('donate.privacyTitle')}
              </p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                {t('donate.privacyText')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {donationWallets.map((wallet) => {
          const copyField = `donation-${wallet.id}`;
          const copied = copiedField === copyField;

          return (
            <article
              key={wallet.id}
              className="surface-card surface-card-hover rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand-primary/15 bg-brand-primary/10 text-sm font-black text-brand-primary">
                    {wallet.symbol}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-on-surface">{wallet.symbol}</h3>
                    <p className="text-xs text-on-surface-variant">{wallet.network}</p>
                  </div>
                </div>
                <Wallet className="h-4 w-4 shrink-0 text-on-surface-variant" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[112px_1fr]">
                <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-outline-variant/20 bg-[#f4f6ef] p-2">
                  {qrCodes[wallet.id] ? (
                    <img
                      src={qrCodes[wallet.id]}
                      alt={`${wallet.symbol} ${t('donate.qrAlt')}`}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="h-full w-full animate-pulse rounded-md bg-surface-high" />
                  )}
                </div>

                <div className="min-w-0 rounded-lg border border-outline-variant/15 bg-surface-lowest/70 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    {t('donate.addressLabel')}
                  </p>
                  <p className="break-all font-mono text-xs leading-5 text-on-surface">
                    {wallet.address}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCopyText(wallet.address, copyField)}
                className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-low text-xs font-bold text-on-surface transition-all hover:border-brand-primary/35 hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                {copied ? <Check className="h-4 w-4 text-brand-tertiary" /> : <Copy className="h-4 w-4" />}
                <span>{copied ? t('donate.copied') : t('donate.copyAddress')}</span>
              </button>
            </article>
          );
        })}
      </div>

      <div className="surface-panel p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-tertiary" />
          <p className="text-sm leading-6 text-on-surface-variant">
            {t('donate.networkWarning')}
          </p>
        </div>
      </div>
    </section>
  );
}
