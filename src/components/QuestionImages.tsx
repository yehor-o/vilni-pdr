import { useState } from 'react';
import { imageUrl } from '../data/loadQuestions';
import { Icon } from './Icon';
import { Modal } from './Modal';

interface Props {
  images: string[];
  captions?: string[];
}

/**
 * Question illustrations. Shown at natural size at most (never upscaled) and
 * never wider than the column; tap opens a larger view.
 */
export function QuestionImages({ images, captions }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (images.length === 0) return null;

  const many = images.length > 1;
  const alt = (i: number) => (many ? `Ілюстрація ${i + 1} до питання` : 'Ілюстрація до питання');
  const openName = openIndex === null ? undefined : images[openIndex];
  const openCaption = openIndex === null ? undefined : captions?.[openIndex];

  return (
    <>
      <div className={`qimages${many ? ' many' : ''}`}>
        {images.map((name, i) => (
          <figure key={name} className="qfig">
            <button
              type="button"
              className="qimg-btn"
              onClick={() => setOpenIndex(i)}
              aria-label={`${alt(i)}: відкрити більшою`}
            >
              <img className="qimg" src={imageUrl(name)} alt={alt(i)} decoding="async" />
              <span className="qimg-zoom" aria-hidden="true">
                <Icon name="zoom" />
              </span>
            </button>
            {captions?.[i] && <figcaption className="qcap">{captions[i]}</figcaption>}
          </figure>
        ))}
      </div>

      <Modal open={openIndex !== null} onClose={() => setOpenIndex(null)} className="lightbox" label="Ілюстрація">
        {openName && (
          <div className="lightbox-box">
            <button type="button" className="iconbtn lightbox-close" onClick={() => setOpenIndex(null)} aria-label="Закрити">
              <Icon name="x" />
            </button>
            <LightboxImage src={imageUrl(openName)} alt={alt(openIndex ?? 0)} />
            {openCaption && <p className="qcap">{openCaption}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Large view: fits the screen, enlarged at most 3x its natural size. */
function LightboxImage({ src, alt }: { src: string; alt: string }) {
  const [natural, setNatural] = useState<number | null>(null);
  return (
    <img
      className="lightbox-img"
      src={src}
      alt={alt}
      style={natural ? { width: `min(100%, ${natural * 3}px)` } : undefined}
      onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
    />
  );
}
