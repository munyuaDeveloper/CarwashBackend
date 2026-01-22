import mongoose from 'mongoose';
import { IAppConfig, IAppConfigModel } from '../types';

const appConfigSchema = new mongoose.Schema({
  // Core wallet reset fields
  autoResetEnabled: {
    type: Boolean,
    default: true, // Default to enabled
    required: true
  },
  lastResetDate: {
    type: Date,
    default: null
  },
  lastResetBy: {
    type: String,
    default: null
  },
  // Flexible settings object for additional config fields
  // This allows adding new config fields without schema changes
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  // Allow additional fields to be stored
  strict: false
});

// Ensure only one config document exists
appConfigSchema.statics['getOrCreateConfig'] = async function (): Promise<IAppConfig> {
  let config = await this.findOne();

  if (!config) {
    // Create default config if none exists
    config = await this.create({
      autoResetEnabled: true,
      lastResetDate: null,
      lastResetBy: null
    });
  }

  return config;
};

// Update config - flexible method that accepts any field updates
appConfigSchema.statics['updateConfig'] = async function (
  updates: Partial<IAppConfig> | Record<string, any>
): Promise<IAppConfig> {
  let config = await this.findOne();

  if (!config) {
    // Create config with defaults
    const defaultConfig: any = {
      autoResetEnabled: updates.autoResetEnabled ?? true,
      lastResetDate: updates.lastResetDate ?? null,
      lastResetBy: updates.lastResetBy ?? null,
      settings: updates.settings ?? {}
    };

    // Add any additional fields from updates
    Object.keys(updates).forEach((key) => {
      if (!['autoResetEnabled', 'lastResetDate', 'lastResetBy', 'settings', '_id', '__v'].includes(key)) {
        defaultConfig[key] = updates[key as keyof typeof updates];
      }
    });

    config = await this.create(defaultConfig);
  } else {
    // Update existing config - handle both explicit fields and settings
    const settings = config.settings || {};

    Object.keys(updates).forEach((key) => {
      const value = updates[key as keyof typeof updates];

      // Skip undefined values and internal fields
      if (value === undefined || ['_id', '__v', 'createdAt', 'updatedAt'].includes(key)) {
        return;
      }

      // Handle explicit schema fields
      if (['autoResetEnabled', 'lastResetDate', 'lastResetBy'].includes(key)) {
        (config as any)[key] = value;
      }
      // Handle settings object updates
      else if (key === 'settings' && typeof value === 'object' && value !== null) {
        Object.assign(settings, value);
        config.settings = settings;
      }
      // Store any other fields in settings for flexibility
      else {
        settings[key] = value;
        config.settings = settings;
      }
    });

    config.updatedAt = new Date();
    await config.save();
  }

  return config;
};

// Get a specific config value (supports both explicit fields and settings)
appConfigSchema.statics['getConfigValue'] = async function (
  key: string
): Promise<any> {
  // Use the model's getOrCreateConfig method
  const config = await (this as any).getOrCreateConfig();

  // Check explicit fields first
  if (['autoResetEnabled', 'lastResetDate', 'lastResetBy'].includes(key)) {
    return (config as any)[key];
  }

  // Check settings object
  if (config.settings && typeof config.settings === 'object') {
    return (config.settings as Record<string, any>)[key];
  }

  return undefined;
};

const AppConfig = mongoose.model<IAppConfig, IAppConfigModel>(
  'AppConfig',
  appConfigSchema
);

export default AppConfig;
