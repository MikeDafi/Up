export class VideoMetadata {
  constructor({
    videoId, description, hashtags, muteByDefault, uploadedAt, geoLocation,
  }) {
    this.videoId = videoId;                  // Unique identifier
    this.description = description;          // Short description
    this.hashtags = hashtags;                // Array of hashtags
    this.muteByDefault = muteByDefault;      // Whether video is muted by default
    this.uploadedAt = uploadedAt;            // Timestamp of upload
    this.city = geoLocation.city;            // City of upload
    this.region = geoLocation.region;        // Region of upload
    this.country = geoLocation.country;      // Country of
  }

  // Converts metadata to JSON format
  toJSON() {
    return {
      videoId: this.videoId,
      description: this.description,
      hashtags: this.hashtags,
      muteByDefault: this.muteByDefault,
      uploadedAt: this.uploadedAt,
      city: this.city,
      region: this.region,
      country: this.country,
    };
  }
}