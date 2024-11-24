class VideoMetadata {
  constructor({
    title, description, hashtags, muteByDefault, filePath, uploadedAt, duration, geoLocation,
  }) {
    this.title = title;                      // Title of the video
    this.description = description;          // Short description
    this.hashtags = hashtags;                // Array of hashtags
    this.muteByDefault = muteByDefault;      // Whether video is muted by default
    this.filePath = filePath;                // Path in S3 bucket
    this.uploadedAt = uploadedAt;            // Timestamp of upload
    this.geoLocation = geoLocation;          // Geolocation of the video
    this.duration = duration;                // Duration of the video
  }

  // Converts metadata to JSON format
  toJSON() {
    return {
      title: this.title,
      description: this.description,
      hashtags: this.hashtags,
      muteByDefault: this.muteByDefault,
      filePath: this.filePath,
      uploadedAt: this.uploadedAt,
      geoLocation: this.geoLocation,
      duration: this.duration,
    };
  }
}