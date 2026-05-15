<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260215130213 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE breathing_exercice CHANGE time_inhale time_inhale VARCHAR(255) NOT NULL, CHANGE time_hold time_hold VARCHAR(255) NOT NULL, CHANGE time_exhale time_exhale VARCHAR(255) NOT NULL, CHANGE number_cycle number_cycle VARCHAR(255) NOT NULL, CHANGE created_at created_at VARCHAR(255) NOT NULL');
        $this->addSql('ALTER TABLE ressource CHANGE created_at created_at VARCHAR(255) NOT NULL, CHANGE updated_at updated_at VARCHAR(255) NOT NULL');
        $this->addSql('ALTER TABLE user CHANGE created_at created_at VARCHAR(255) NOT NULL, CHANGE updated_at updated_at VARCHAR(255) NOT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE breathing_exercice CHANGE time_inhale time_inhale INT NOT NULL, CHANGE time_hold time_hold INT DEFAULT NULL, CHANGE time_exhale time_exhale INT NOT NULL, CHANGE number_cycle number_cycle INT NOT NULL, CHANGE created_at created_at DATETIME NOT NULL');
        $this->addSql('ALTER TABLE ressource CHANGE created_at created_at DATETIME NOT NULL, CHANGE updated_at updated_at DATETIME NOT NULL');
        $this->addSql('ALTER TABLE `user` CHANGE created_at created_at DATETIME NOT NULL, CHANGE updated_at updated_at DATETIME NOT NULL');
    }
}
