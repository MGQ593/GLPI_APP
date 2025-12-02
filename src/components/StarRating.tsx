"use client";

import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number | null;
  onRate?: (rating: number) => void;
  readonly?: boolean;
  size?: number;
}

export function StarRating({ rating, onRate, readonly = false, size = 16 }: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5];

  // Use span for readonly to avoid button-inside-button hydration issues
  if (readonly) {
    return (
      <div className="flex items-center gap-0.5">
        {stars.map((star) => (
          <span key={star} className="cursor-default">
            <Star
              size={size}
              className={`${
                rating && star <= rating
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-none text-gray-300'
              }`}
            />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRate?.(star)}
          className="cursor-pointer hover:scale-110 transition-transform"
        >
          <Star
            size={size}
            className={`${
              rating && star <= rating
                ? 'fill-amber-400 text-amber-400'
                : 'fill-none text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
