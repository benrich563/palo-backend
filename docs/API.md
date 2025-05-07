# API Documentation

## Image Upload Endpoints

### POST /api/upload/image
Upload a new image to the system.

**Request Headers:**
- Authorization: Bearer {token}

**Request Body:**
- image: File (multipart/form-data)

**Response:**
```json
{
  "url": "https://cloudinary.com/...",
  "public_id": "mvp/abc123"
}
```

### DELETE /api/upload/image/:publicId
Delete an uploaded image.

**Request Headers:**
- Authorization: Bearer {token}

**Response:**
```json
{
  "result": "ok"
}
```

## Analytics Endpoints

### GET /api/admin/analytics/detailed
Get detailed analytics data.

**Query Parameters:**
- startDate: ISO 8601 date (optional)
- endDate: ISO 8601 date (optional)

**Response:**
```json
{
  "deliveryMetrics": {},
  "peakHours": [],
  "riderMetrics": [],
  "locationHeatMap": [],
  "customerRetention": []
}
```