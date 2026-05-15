<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260515000002 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Change breathing_exercice description from VARCHAR(255) to TEXT';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE breathing_exercice CHANGE description description LONGTEXT NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE breathing_exercice CHANGE description description VARCHAR(255) NOT NULL');
    }
}
