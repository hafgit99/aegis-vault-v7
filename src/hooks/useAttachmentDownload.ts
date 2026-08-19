import type { AppNotification } from '../types';
import { getAttachmentBlob } from '../lib/attachments';
import { isDesktopRuntime } from '../lib/desktopStorage';
import { saveDesktopBinaryFile } from '../lib/desktopFiles';
import { useLanguage } from '../i18n/LanguageContext';

interface UseAttachmentDownloadOptions {
  onNotify: (notification: AppNotification) => void;
}

function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!reader.result || typeof reader.result === 'string') {
        reject(new Error('Attachment blob could not be read as bytes.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function useAttachmentDownload({ onNotify }: UseAttachmentDownloadOptions) {
  const { t } = useLanguage();

  const downloadAttachment = async (id: string, name: string) => {
    try {
      const res = await getAttachmentBlob(id);
      if (res) {
        const filename = res.name || name;
        if (isDesktopRuntime()) {
          const bytes = await blobToBytes(res.blob);
          try {
            await saveDesktopBinaryFile(filename, bytes);
            return;
          } catch (desktopError) {
            console.warn('Native attachment save failed; falling back to browser download.', desktopError);
          }
        }

        const url = URL.createObjectURL(res.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } else {
        onNotify({
          title: t('attachmentDownload.notFoundTitle'),
          message: t('attachmentDownload.notFoundMessage'),
          type: 'warning',
        });
      }
    } catch (err) {
      console.error(err);
      onNotify({
        title: t('attachmentDownload.openFailedTitle'),
        message: t('attachmentDownload.openFailedMessage'),
        type: 'danger',
      });
    }
  };

  return {
    downloadAttachment,
  };
}
