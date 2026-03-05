package app

import (
	"database/sql"
	"log/slog"

	"gongyu/internal/config"
	"gongyu/internal/exporter"
	"gongyu/internal/importer"
	"gongyu/internal/repo"
	"gongyu/internal/service"
	"gongyu/internal/session"
	"gongyu/internal/social"
)

type App struct {
	Config        config.Config
	Logger        *slog.Logger
	DB            *sql.DB
	Repos         repo.Repositories
	Sessions      *session.Manager
	Settings      *service.SettingsService
	Metadata      *service.MetadataService
	Importer      *importer.Service
	Exporter      *exporter.Service
	Social        *social.Service
	SecureCookies bool
}

func New(cfg config.Config, logger *slog.Logger, db *sql.DB, repos repo.Repositories) *App {
	sessionManager := session.New(cfg.SessionSecret)
	settingsService := service.NewSettingsService(repos.Settings, service.NewSettingsCrypto(cfg.SettingSecret))
	metadataService := service.NewMetadataService()
	importService := importer.New(repos.Bookmarks)
	exportService := exporter.New()
	socialService := social.New(settingsService, logger)

	return &App{
		Config:        cfg,
		Logger:        logger,
		DB:            db,
		Repos:         repos,
		Sessions:      sessionManager,
		Settings:      settingsService,
		Metadata:      metadataService,
		Importer:      importService,
		Exporter:      exportService,
		Social:        socialService,
		SecureCookies: !cfg.AllowInsecure,
	}
}
