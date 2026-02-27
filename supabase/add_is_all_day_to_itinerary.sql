-- Add is_all_day column to itinerary table
ALTER TABLE itinerary
ADD COLUMN is_all_day BOOLEAN DEFAULT FALSE;

-- Update existing records where times are set to 00:00:00 (likely all-day events)
UPDATE itinerary
SET is_all_day = TRUE
WHERE start_time IS NOT NULL 
  AND end_time IS NOT NULL
  AND DATE_TRUNC('day', start_time) = start_time
  AND DATE_TRUNC('day', end_time) = end_time;

-- Create an index for better query performance
CREATE INDEX idx_itinerary_all_day ON itinerary(trip_id, is_all_day);
