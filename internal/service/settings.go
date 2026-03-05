package service

import (
	"context"

	"gongyu/internal/repo"
)

type SettingsService struct {
	repo   *repo.SettingRepository
	crypto *SettingsCrypto
}

func NewSettingsService(settingRepo *repo.SettingRepository, crypto *SettingsCrypto) *SettingsService {
	return &SettingsService{repo: settingRepo, crypto: crypto}
}

func (s *SettingsService) Get(ctx context.Context, key string, fallback string) (string, error) {
	setting, err := s.repo.Find(ctx, key)
	if err != nil || setting == nil {
		return fallback, err
	}
	if !setting.Encrypted {
		if setting.Value == "" {
			return fallback, nil
		}
		return setting.Value, nil
	}
	if setting.Value == "" {
		return fallback, nil
	}
	decrypted, err := s.crypto.Decrypt(setting.Value)
	if err != nil {
		return fallback, nil
	}
	if decrypted == "" {
		return fallback, nil
	}
	return decrypted, nil
}

func (s *SettingsService) Set(ctx context.Context, key, value string, encrypted bool) error {
	if encrypted {
		encryptedValue, err := s.crypto.Encrypt(value)
		if err != nil {
			return err
		}
		return s.repo.Set(ctx, key, encryptedValue, true)
	}
	return s.repo.Set(ctx, key, value, false)
}

func (s *SettingsService) Values(ctx context.Context, keys []string) (map[string]string, error) {
	items, err := s.repo.Keys(ctx, keys)
	if err != nil {
		return nil, err
	}
	values := map[string]string{}
	for _, key := range keys {
		setting, ok := items[key]
		if !ok {
			values[key] = ""
			continue
		}
		if !setting.Encrypted {
			values[key] = setting.Value
			continue
		}
		decrypted, err := s.crypto.Decrypt(setting.Value)
		if err != nil {
			values[key] = ""
			continue
		}
		values[key] = decrypted
	}
	return values, nil
}
