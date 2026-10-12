import mongoose from 'mongoose';
import { MEASUREMENT_FIELDS, STATION_CODE_RE } from '../config/constants.js';

const stationSchema = new mongoose.Schema(
  {
    // Публічний ідентифікатор станції, наприклад KYIV-01
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: STATION_CODE_RE
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 60, index: true },
    // GeoJSON: порядок координат [довгота, широта]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }
    },
    active: { type: Boolean, default: true },
    measurement_types: [{ type: String, enum: MEASUREMENT_FIELDS }]
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        ret.id = ret.code;
        delete ret._id;
        return ret;
      }
    }
  }
);

stationSchema.index({ location: '2dsphere' });

stationSchema.virtual('latitude').get(function () {
  return this.location?.coordinates?.[1];
});

stationSchema.virtual('longitude').get(function () {
  return this.location?.coordinates?.[0];
});

export const Station = mongoose.model('Station', stationSchema);
