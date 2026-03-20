
export const compressImage = async (src: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Set crossOrigin to anonymous to allow exporting the canvas if the image is from a different origin
    // This is only needed for URLs, not for base64 strings, but it doesn't hurt for base64
    if (src.startsWith('http')) {
      img.crossOrigin = 'anonymous';
    }
    
    img.src = src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = (error) => reject(error);
  });
};
