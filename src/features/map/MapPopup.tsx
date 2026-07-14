import { useEffect, useRef } from 'react';
import { Popup } from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';

export interface PopupContent {
  lngLat: { lng: number; lat: number };
  title: string;
  description?: string;
}

interface MapPopupProps {
  map: MLMap | null;
  content: PopupContent | null;
  onClose?: () => void;
}

/**
 * Thin wrapper around maplibre-gl's Popup. Controlled via the `content` prop.
 */
export function MapPopup({ map, content, onClose }: MapPopupProps) {
  const popupRef = useRef<Popup | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!content) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    if (popupRef.current) {
      popupRef.current.remove();
    }

    const html = `
      <div class="landscope-popup">
        <div class="landscope-popup__title">${escapeHtml(content.title)}</div>
        ${content.description ? `<div class="landscope-popup__desc">${escapeHtml(content.description)}</div>` : ''}
      </div>
    `;

    const popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: '280px',
      offset: 8,
    })
      .setLngLat([content.lngLat.lng, content.lngLat.lat])
      .setHTML(html)
      .addTo(map);

    popup.on('close', () => {
      onClose?.();
    });

    popupRef.current = popup;

    return () => {
      popup.remove();
      popupRef.current = null;
    };
  }, [map, content, onClose]);

  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
