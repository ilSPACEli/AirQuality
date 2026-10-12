import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Measurement } from '../src/models/Measurement.js';
import { Station } from '../src/models/Station.js';

let mongo;

// Ізольована база в пам'яті: тести не торкаються робочої бази в Atlas
export async function startDatabase() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([Station.init(), Measurement.init()]); // дочекатися унікальних індексів
}

export async function clearDatabase() {
  await Promise.all([Station.deleteMany({}), Measurement.deleteMany({})]);
}

export async function stopDatabase() {
  await mongoose.disconnect();
  await mongo.stop();
}

export const kyivStation = {
  code: 'KYIV-01',
  name: 'Київ, вул. Хрещатик',
  city: 'Kyiv',
  latitude: 50.4501,
  longitude: 30.5234,
  measurement_types: ['pm25', 'pm10']
};

export const lvivStation = {
  code: 'LVIV-01',
  name: 'Львів, пл. Ринок',
  city: 'Lviv',
  latitude: 49.8397,
  longitude: 24.0297
};
