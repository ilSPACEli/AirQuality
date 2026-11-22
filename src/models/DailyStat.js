import mongoose from 'mongoose';
import { POLLUTANTS } from '../config/constants.js';

// Добовий агрегат однієї речовини. mean = null, якщо доба неповна (менше 18 дійсних годин)
const pollutantDaySchema = new mongoose.Schema(
  {
    mean: { type: Number, default: null },
    mean_raw: { type: Number, default: null }, // середнє за наявні години, лише для довідки
    max: { type: Number, default: null },
    hours: { type: Number, default: 0 },
    complete: { type: Boolean, default: false },
    max8h: { type: Number, default: null } // лише для CO і O3
  },
  { _id: false }
);

const dailyStatSchema = new mongoose.Schema(
  {
    station_id: { type: String, required: true, uppercase: true },
    // Місцева дата Europe/Kyiv і момент UTC, що відповідає її півночі
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    day_start: { type: Date, required: true },
    pollutants: Object.fromEntries(POLLUTANTS.map(p => [p, { type: pollutantDaySchema, default: null }]))
  },
  {
    collection: 'daily_stats',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      versionKey: false,
      transform(doc, ret) {
        delete ret._id;
        return ret;
      }
    }
  }
);

dailyStatSchema.index({ station_id: 1, date: 1 }, { unique: true });

export const DailyStat = mongoose.model('DailyStat', dailyStatSchema);
