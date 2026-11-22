import mongoose from 'mongoose';
import { POLLUTANTS } from '../config/constants.js';

// Подія перевищення нормативу: K = значення / норматив > 1
const alertSchema = new mongoose.Schema(
  {
    station_id: { type: String, required: true, uppercase: true },
    pollutant: { type: String, enum: POLLUTANTS, required: true },
    period: { type: String, enum: ['hour', 'day', 'max8h'], required: true },
    norm_type: { type: String, enum: ['gdk_mr', 'gdk_sd', 'limit'], required: true },
    time: { type: Date, required: true }, // початок години або доби (UTC)
    date: { type: String }, // місцева дата для добових подій
    value: { type: Number, required: true },
    norm: { type: Number, required: true },
    ratio: { type: Number, required: true },
    unit: { type: String, required: true },
    source: { type: String, required: true }
  },
  {
    collection: 'alerts',
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: {
      versionKey: false,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      }
    }
  }
);

alertSchema.index({ station_id: 1, time: 1 });

export const Alert = mongoose.model('Alert', alertSchema);
