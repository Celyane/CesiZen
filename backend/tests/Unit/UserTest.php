<?php

namespace App\Tests\Unit;

use App\Entity\BreathingExercice;
use App\Entity\Resource;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

class UserTest extends TestCase
{
    private User $user;

    protected function setUp(): void
    {
        $this->user = new User();
    }

    public function testDefaultRolesIncludeRoleUser(): void
    {
        $roles = $this->user->getRoles();
        $this->assertContains('ROLE_USER', $roles);
    }

    public function testSetAndGetEmail(): void
    {
        $this->user->setEmail('test@example.com');
        $this->assertSame('test@example.com', $this->user->getEmail());
    }

    public function testGetUserIdentifierReturnsEmail(): void
    {
        $this->user->setEmail('alice@example.com');
        $this->assertSame('alice@example.com', $this->user->getUserIdentifier());
    }

    public function testSetAndGetFirstname(): void
    {
        $this->user->setFirstname('Alice');
        $this->assertSame('Alice', $this->user->getFirstname());
    }

    public function testSetAndGetLastname(): void
    {
        $this->user->setLastname('Martin');
        $this->assertSame('Martin', $this->user->getLastname());
    }

    public function testIsVerifiedDefaultsFalse(): void
    {
        $this->assertFalse($this->user->isVerified());
    }

    public function testSetIsVerified(): void
    {
        $this->user->setIsVerified(true);
        $this->assertTrue($this->user->isVerified());
    }

    public function testSetRoleAdmin(): void
    {
        $this->user->setRole(['ROLE_ADMIN']);
        $roles = $this->user->getRoles();
        $this->assertContains('ROLE_ADMIN', $roles);
        $this->assertContains('ROLE_USER', $roles);
    }

    public function testSetRoleRedactor(): void
    {
        $this->user->setRole(['ROLE_REDACTOR']);
        $this->assertContains('ROLE_REDACTOR', $this->user->getRoles());
    }

    public function testRolesAreUnique(): void
    {
        $this->user->setRole(['ROLE_USER']);
        $roles = $this->user->getRoles();
        $this->assertSame(count($roles), count(array_unique($roles)));
    }

    public function testAddAndRemoveReadResource(): void
    {
        $resource = new Resource();
        $this->user->addReadResource($resource);
        $this->assertTrue($this->user->getReadResources()->contains($resource));

        $this->user->removeReadResource($resource);
        $this->assertFalse($this->user->getReadResources()->contains($resource));
    }

    public function testAddReadResourceIsIdempotent(): void
    {
        $resource = new Resource();
        $this->user->addReadResource($resource);
        $this->user->addReadResource($resource);
        $this->assertCount(1, $this->user->getReadResources());
    }

    public function testAddAndRemoveFavoriteResource(): void
    {
        $resource = new Resource();
        $this->user->addFavoriteResource($resource);
        $this->assertTrue($this->user->getFavoriteResources()->contains($resource));

        $this->user->removeFavoriteResource($resource);
        $this->assertFalse($this->user->getFavoriteResources()->contains($resource));
    }

    public function testAddAndRemoveExerciceDone(): void
    {
        $exercice = new BreathingExercice();
        $this->user->addExerciceDone($exercice);
        $this->assertTrue($this->user->getExerciceDone()->contains($exercice));

        $this->user->removeExerciceDone($exercice);
        $this->assertFalse($this->user->getExerciceDone()->contains($exercice));
    }
}
