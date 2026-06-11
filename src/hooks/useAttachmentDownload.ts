import { AppNotification } from '../types';
import { getAttachmentBlob } from '../lib/attachments';
import { useLanguage } from '../i18n/LanguageContext';

interface UseAttachmentDownloadOptions {
  onNotify: (notification: AppNotification) => void;
}

export function useAttachmentDownload({ onNotify }: UseAttachmentDownloadOptions) {
  const { t } = useLanguage();

  const downloadAttachment = async (id: string, name: string) => {
    try {
      const res = await getAttachmentBlob(id);
      if (res) {
        const url = URL.createObjectURL(res.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
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
