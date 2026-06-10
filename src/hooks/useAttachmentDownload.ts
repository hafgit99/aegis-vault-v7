import { AppNotification } from '../types';
import { getAttachmentBlob } from '../lib/attachments';

interface UseAttachmentDownloadOptions {
  onNotify: (notification: AppNotification) => void;
}

export function useAttachmentDownload({ onNotify }: UseAttachmentDownloadOptions) {
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
          title: 'Dosya Bulunamadı',
          message: 'Seçili dosya yerel kasanızda bulunamadı veya silinmiş.',
          type: 'warning',
        });
      }
    } catch (err) {
      console.error(err);
      onNotify({
        title: 'Dosya Açılamadı',
        message: 'Dosya şifresi çözülürken bir hata ile karşılaşıldı.',
        type: 'danger',
      });
    }
  };

  return {
    downloadAttachment,
  };
}
