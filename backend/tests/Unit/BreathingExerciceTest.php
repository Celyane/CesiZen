<?php

namespace App\Tests\Unit;

use App\Entity\BreathingExercice;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

class BreathingExerciceTest extends TestCase
{
    private BreathingExercice $exercice;

    protected function setUp(): void
    {
        $this->exercice = new BreathingExercice();
    }

    public function testSetAndGetName(): void
    {
        $this->exercice->setName('Cohérence cardiaque');
        $this->assertSame('Cohérence cardiaque', $this->exercice->getName());
    }

    public function testSetAndGetDuration(): void
    {
        $this->exercice->setDuration(300);
        $this->assertSame(300, $this->exercice->getDuration());
    }

    public function testSetAndGetDescription(): void
    {
        $this->exercice->setDescription('Exercice de respiration relaxant');
        $this->assertSame('Exercice de respiration relaxant', $this->exercice->getDescription());
    }

    public function testSetAndGetType(): void
    {
        $this->exercice->setType('relaxation');
        $this->assertSame('relaxation', $this->exercice->getType());
    }

    public function testSetAndGetTimeInhale(): void
    {
        $this->exercice->setTimeInhale(4);
        $this->assertSame(4, $this->exercice->getTimeInhale());
    }

    public function testSetAndGetTimeHold(): void
    {
        $this->exercice->setTimeHold(7);
        $this->assertSame(7, $this->exercice->getTimeHold());
    }

    public function testTimeHoldCanBeNull(): void
    {
        $this->exercice->setTimeHold(null);
        $this->assertNull($this->exercice->getTimeHold());
    }

    public function testSetAndGetTimeExhale(): void
    {
        $this->exercice->setTimeExhale(8);
        $this->assertSame(8, $this->exercice->getTimeExhale());
    }

    public function testSetAndGetNumberCycle(): void
    {
        $this->exercice->setNumberCycle(6);
        $this->assertSame(6, $this->exercice->getNumberCycle());
    }

    public function testUsersCollectionIsEmptyByDefault(): void
    {
        $this->assertCount(0, $this->exercice->getUsers());
    }

    public function testAddAndRemoveUser(): void
    {
        $user = new User();
        $this->exercice->addUser($user);
        $this->assertTrue($this->exercice->getUsers()->contains($user));
        $this->assertTrue($user->getExerciceDone()->contains($this->exercice));

        $this->exercice->removeUser($user);
        $this->assertFalse($this->exercice->getUsers()->contains($user));
        $this->assertFalse($user->getExerciceDone()->contains($this->exercice));
    }

    public function testAddUserIsIdempotent(): void
    {
        $user = new User();
        $this->exercice->addUser($user);
        $this->exercice->addUser($user);
        $this->assertCount(1, $this->exercice->getUsers());
    }

    public function testTotalCycleTime(): void
    {
        $this->exercice->setTimeInhale(5);
        $this->exercice->setTimeHold(null);
        $this->exercice->setTimeExhale(5);
        $this->exercice->setNumberCycle(6);

        $totalSeconds = ($this->exercice->getTimeInhale() + ($this->exercice->getTimeHold() ?? 0) + $this->exercice->getTimeExhale()) * $this->exercice->getNumberCycle();
        $this->assertSame(60, $totalSeconds);
    }
}
