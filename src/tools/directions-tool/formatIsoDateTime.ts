/**
 * Helper function to format ISO datetime strings according to Mapbox API requirements.
 * It converts the format YYYY-MM-DDThh:mm:ss (with seconds but no timezone) to
 * YYYY-MM-DDThh:mm (no seconds, no timezone) by removing the seconds part.
 * Other valid formats are left unchanged.
 */
export const formatIsoDateTime = (dateTime: string): string => {
  // Regex for matching YYYY-MM-DDThh:mm:ss format (with seconds but no timezone)
  const dateWithSecondsNoTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

  if (dateWithSecondsNoTz.test(dateTime)) {
    // Extract up to the minutes part only, dropping the seconds
    return dateTime.substring(0, dateTime.lastIndexOf(':'));
  }

  // Return unchanged if it's already in a valid format
  return dateTime;
};
