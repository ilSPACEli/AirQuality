import mongoose from 'mongoose';
import { MEASUREMENT_FIELDS, MEASUREMENT_SOURCES, RANGES } from '../config/constants.js';

// null означає «сенсор не передав дані», 0 означає «забруднення не виявлено»
const valueFields = Object.fromEntries(
  MEASUREMENT_FIELDS.map(field => [
    field,
    { type: Number, default: null, min: RANGES[field].min, max: RANGES[field].max }
  ])
);

const measurementSchema = new mongoose.Schema(
  {
    station_id: { type: String, required: true, trim: true, uppercase: true },
    // Зберігається в UTC, локальний час лише при відображенні
    measured_at: { type: Date, required: true },
    ...valueFields,
    source: { type: String, enum: MEASUREMENT_SOURCES, default: 'manual' }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(doc, ret) {
        delete ret._id;
        return ret;
      }
    }
  }
);

// Природний ключ вимірювання: станція + момент часу (ідемпотентний імпорт)
measurementSchema.index({ station_id: 1, measured_at: -1 }, { unique: true });
measurementSchema.index({ measured_at: -1, _id: -1 });

export const Measurement = mongoose.model('Measurement', measurementSchema);
