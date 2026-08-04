/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, Check, Clock, Server, HardDrive } from 'lucide-react';
import { SyncConflictItem } from '../lib/sync';

export interface SyncConflictModalProps {
  isOpen: boolean;
  conflicts: SyncConflictItem[];
  onResolveKeepLocal: (conflictId: string) => void;
  onResolveKeepRemote: (conflictId: string) => void;
  onClose: () => void;
}

export const SyncConflictModal: React.FC<SyncConflictModalProps> = ({
  isOpen,
  conflicts,
  onResolveKeepLocal,
  onResolveKeepRemote,
  onClose,
}) => {
  if (!isOpen || conflicts.length === 0) return null;

  const formatTs = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Senkronizasyon Çakışması Algılandı
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Aşağıdaki kayıtlar hem bu cihazda hem de uzak sunucuda aynı anda güncellendi. Lütfen tutmak istediğiniz sürümü seçin.
            </p>
          </div>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
          {conflicts.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3"
            >
              <div className="font-semibold text-slate-900 dark:text-white text-base">
                {item.title}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Local Choice */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                      <span>Bu Cihaz (Yerel)</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTs(item.localUpdatedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolveKeepLocal(item.id)}
                    className="w-full py-1.5 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Yerel Sürümü Tut</span>
                  </button>
                </div>

                {/* Remote Choice */}
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                      <Server className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Uzak Sunucu</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTs(item.remoteUpdatedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onResolveKeepRemote(item.id)}
                    className="w-full py-1.5 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Uzak Sürümü Tut</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
