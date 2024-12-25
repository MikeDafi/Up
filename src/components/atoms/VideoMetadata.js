export class VideoMetadata {
  constructor({
    videoId = '',
    title = '',
    description = 'aaaaaaaaa aaaaaaaaa aaaaaaaaa aaaaaaaaa',
    hashtags = [],
    muteByDefault = false,
    uploadedAt = '',
    city = '',
    region = '',
    country = '',
  }) {
    this.videoId = videoId;                  // Unique identifier
    this.title = title;                      // Title of video
    this.description = description;          // Short description
    this.hashtags = hashtags;                // Array of hashtags
    this.muteByDefault = muteByDefault;      // Whether video is muted by default
    this.uploadedAt = uploadedAt;            // Timestamp of upload
    this.city = city;                        // City of upload
    this.region = region;                    // Region of upload
    this.country = country;                  // Country of
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