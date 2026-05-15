<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20260206140120 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE TABLE breathing_exercice (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(50) NOT NULL, duration INT NOT NULL, description VARCHAR(255) NOT NULL, type VARCHAR(50) NOT NULL, time_inhale INT NOT NULL, time_hold INT DEFAULT NULL, time_exhale INT NOT NULL, number_cycle INT NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE ressource (id INT AUTO_INCREMENT NOT NULL, title VARCHAR(50) NOT NULL, text VARCHAR(255) NOT NULL, image VARCHAR(255) DEFAULT NULL, type VARCHAR(50) NOT NULL, visible TINYINT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, author_id INT NOT NULL, INDEX IDX_939F4544F675F31B (author_id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE `user` (id INT AUTO_INCREMENT NOT NULL, lastname VARCHAR(50) NOT NULL, firstname VARCHAR(50) NOT NULL, email VARCHAR(50) NOT NULL, password VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, role JSON NOT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE user_breathing_exercice (user_id INT NOT NULL, breathing_exercice_id INT NOT NULL, INDEX IDX_2E954D0BA76ED395 (user_id), INDEX IDX_2E954D0B6FA23102 (breathing_exercice_id), PRIMARY KEY (user_id, breathing_exercice_id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('CREATE TABLE messenger_messages (id BIGINT AUTO_INCREMENT NOT NULL, body LONGTEXT NOT NULL, headers LONGTEXT NOT NULL, queue_name VARCHAR(190) NOT NULL, created_at DATETIME NOT NULL, available_at DATETIME NOT NULL, delivered_at DATETIME DEFAULT NULL, INDEX IDX_75EA56E0FB7336F0E3BD61CE16BA31DBBF396750 (queue_name, available_at, delivered_at, id), PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4');
        $this->addSql('ALTER TABLE ressource ADD CONSTRAINT FK_939F4544F675F31B FOREIGN KEY (author_id) REFERENCES `user` (id)');
        $this->addSql('ALTER TABLE user_breathing_exercice ADD CONSTRAINT FK_2E954D0BA76ED395 FOREIGN KEY (user_id) REFERENCES `user` (id) ON DELETE CASCADE');
        $this->addSql('ALTER TABLE user_breathing_exercice ADD CONSTRAINT FK_2E954D0B6FA23102 FOREIGN KEY (breathing_exercice_id) REFERENCES breathing_exercice (id) ON DELETE CASCADE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE ressource DROP FOREIGN KEY FK_939F4544F675F31B');
        $this->addSql('ALTER TABLE user_breathing_exercice DROP FOREIGN KEY FK_2E954D0BA76ED395');
        $this->addSql('ALTER TABLE user_breathing_exercice DROP FOREIGN KEY FK_2E954D0B6FA23102');
        $this->addSql('DROP TABLE breathing_exercice');
        $this->addSql('DROP TABLE ressource');
        $this->addSql('DROP TABLE `user`');
        $this->addSql('DROP TABLE user_breathing_exercice');
        $this->addSql('DROP TABLE messenger_messages');
    }
}
