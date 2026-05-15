<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260515000001 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Fix column types, add read/favorite relations, add role_redactor support';
    }

    public function up(Schema $schema): void
    {
        // Fix breathing_exercice column types from VARCHAR to INT
        $this->addSql('ALTER TABLE breathing_exercice
            CHANGE time_inhale time_inhale INT NOT NULL,
            CHANGE time_hold time_hold INT DEFAULT NULL,
            CHANGE time_exhale time_exhale INT NOT NULL,
            CHANGE number_cycle number_cycle INT NOT NULL
        ');

        // Fix breathing_exercice created_at from VARCHAR to DATETIME and add updated_at
        $this->addSql('ALTER TABLE breathing_exercice
            CHANGE created_at created_at DATETIME NOT NULL,
            ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ');

        // Fix ressource timestamps from VARCHAR to DATETIME
        $this->addSql('ALTER TABLE ressource
            CHANGE created_at created_at DATETIME NOT NULL,
            CHANGE updated_at updated_at DATETIME NOT NULL
        ');

        // Fix ressource text column to TEXT and title to 100 chars
        $this->addSql('ALTER TABLE ressource
            CHANGE title title VARCHAR(100) NOT NULL,
            CHANGE text text LONGTEXT NOT NULL
        ');

        // Fix user email length to 180 for unique constraint compatibility
        $this->addSql('ALTER TABLE `user` CHANGE email email VARCHAR(180) NOT NULL');

        // Create user_resource_read join table
        $this->addSql('CREATE TABLE user_resource_read (
            user_id INT NOT NULL,
            resource_id INT NOT NULL,
            PRIMARY KEY (user_id, resource_id),
            INDEX IDX_USER_READ (user_id),
            INDEX IDX_RESOURCE_READ (resource_id),
            CONSTRAINT FK_USER_RESOURCE_READ_USER FOREIGN KEY (user_id) REFERENCES `user` (id) ON DELETE CASCADE,
            CONSTRAINT FK_USER_RESOURCE_READ_RESOURCE FOREIGN KEY (resource_id) REFERENCES ressource (id) ON DELETE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');

        // Create user_resource_favorite join table
        $this->addSql('CREATE TABLE user_resource_favorite (
            user_id INT NOT NULL,
            resource_id INT NOT NULL,
            PRIMARY KEY (user_id, resource_id),
            INDEX IDX_USER_FAV (user_id),
            INDEX IDX_RESOURCE_FAV (resource_id),
            CONSTRAINT FK_USER_RESOURCE_FAV_USER FOREIGN KEY (user_id) REFERENCES `user` (id) ON DELETE CASCADE,
            CONSTRAINT FK_USER_RESOURCE_FAV_RESOURCE FOREIGN KEY (resource_id) REFERENCES ressource (id) ON DELETE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE user_resource_read');
        $this->addSql('DROP TABLE user_resource_favorite');

        $this->addSql('ALTER TABLE breathing_exercice
            CHANGE time_inhale time_inhale VARCHAR(255) NOT NULL,
            CHANGE time_hold time_hold VARCHAR(255) DEFAULT NULL,
            CHANGE time_exhale time_exhale VARCHAR(255) NOT NULL,
            CHANGE number_cycle number_cycle VARCHAR(255) NOT NULL,
            CHANGE created_at created_at VARCHAR(255) NOT NULL,
            DROP updated_at
        ');

        $this->addSql('ALTER TABLE ressource
            CHANGE created_at created_at VARCHAR(255) NOT NULL,
            CHANGE updated_at updated_at VARCHAR(255) NOT NULL,
            CHANGE title title VARCHAR(50) NOT NULL,
            CHANGE text text VARCHAR(255) NOT NULL
        ');

        $this->addSql('ALTER TABLE `user` CHANGE email email VARCHAR(50) NOT NULL');
    }
}
