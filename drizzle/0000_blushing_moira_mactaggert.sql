CREATE TABLE `BrowserOwner` (
	`id` text PRIMARY KEY NOT NULL,
	`tokenHash` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `BrowserOwner_tokenHash_unique` ON `BrowserOwner` (`tokenHash`);--> statement-breakpoint
CREATE TABLE `Report` (
	`id` text PRIMARY KEY NOT NULL,
	`ownerId` text NOT NULL,
	`uploadedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`riskType` text DEFAULT '기타' NOT NULL,
	`aiSummary` text DEFAULT '' NOT NULL,
	`draftText` text DEFAULT '' NOT NULL,
	`imagePath` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`locationLabel` text DEFAULT '' NOT NULL,
	`placeType` text DEFAULT '공공시설' NOT NULL,
	`status` text DEFAULT 'PREPARING' NOT NULL,
	`isDraft` integer DEFAULT 1 NOT NULL,
	`isPublic` integer DEFAULT 0 NOT NULL,
	`photoPublic` integer DEFAULT 0 NOT NULL,
	`publicConsentAt` integer,
	`photoConsentAt` integer,
	`aiConsentAt` integer,
	`riskLevel` text DEFAULT 'UNKNOWN' NOT NULL,
	`riskReason` text DEFAULT '' NOT NULL,
	`riskAssessedAt` integer,
	`riskModel` text,
	`userReportedAt` integer,
	`statusChangeSource` text DEFAULT 'USER' NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `BrowserOwner`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ReportStatusHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`reportId` text NOT NULL,
	`fromStatus` text NOT NULL,
	`toStatus` text NOT NULL,
	`changedAt` integer NOT NULL,
	`changeSource` text NOT NULL,
	FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TRIGGER Report_status_history AFTER UPDATE OF status ON Report WHEN OLD.status <> NEW.status BEGIN INSERT INTO ReportStatusHistory (id,reportId,fromStatus,toStatus,changedAt,changeSource) VALUES (lower(hex(randomblob(16))),NEW.id,OLD.status,NEW.status,CAST(strftime('%s','now') AS INTEGER)*1000,NEW.statusChangeSource); END;
