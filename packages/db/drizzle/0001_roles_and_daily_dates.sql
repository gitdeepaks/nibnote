ALTER TABLE `folders` ADD `role` text;--> statement-breakpoint
ALTER TABLE `notebooks` ADD `role` text;--> statement-breakpoint
ALTER TABLE `pages` ADD `daily_date` text;--> statement-breakpoint
CREATE INDEX `pages_notebook_daily_idx` ON `pages` (`notebook_id`,`daily_date`);