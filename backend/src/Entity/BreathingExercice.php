<?php

namespace App\Entity;

use App\Repository\BreathingExerciceRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Gedmo\Timestampable\Traits\TimestampableEntity;

#[ORM\Entity(repositoryClass: BreathingExerciceRepository::class)]
class BreathingExercice
{
    use TimestampableEntity;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 50)]
    private ?string $name = null;

    #[ORM\Column]
    private ?int $duration = null;

    #[ORM\Column(type: 'text')]
    private ?string $description = null;

    #[ORM\Column(length: 50)]
    private ?string $type = null;

    #[ORM\Column]
    private ?int $timeInhale = null;

    #[ORM\Column(nullable: true)]
    private ?int $timeHold = null;

    #[ORM\Column]
    private ?int $timeExhale = null;

    #[ORM\Column]
    private ?int $numberCycle = null;

    /** @var Collection<int, User> */
    #[ORM\ManyToMany(targetEntity: User::class, mappedBy: 'exerciceDone')]
    private Collection $users;

    public function __construct()
    {
        $this->users = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;
        return $this;
    }

    public function getDuration(): ?int
    {
        return $this->duration;
    }

    public function setDuration(int $duration): static
    {
        $this->duration = $duration;
        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(string $description): static
    {
        $this->description = $description;
        return $this;
    }

    public function getType(): ?string
    {
        return $this->type;
    }

    public function setType(string $type): static
    {
        $this->type = $type;
        return $this;
    }

    public function getTimeInhale(): ?int
    {
        return $this->timeInhale;
    }

    public function setTimeInhale(int $timeInhale): static
    {
        $this->timeInhale = $timeInhale;
        return $this;
    }

    public function getTimeHold(): ?int
    {
        return $this->timeHold;
    }

    public function setTimeHold(?int $timeHold): static
    {
        $this->timeHold = $timeHold;
        return $this;
    }

    public function getTimeExhale(): ?int
    {
        return $this->timeExhale;
    }

    public function setTimeExhale(int $timeExhale): static
    {
        $this->timeExhale = $timeExhale;
        return $this;
    }

    public function getNumberCycle(): ?int
    {
        return $this->numberCycle;
    }

    public function setNumberCycle(int $numberCycle): static
    {
        $this->numberCycle = $numberCycle;
        return $this;
    }

    /** @return Collection<int, User> */
    public function getUsers(): Collection
    {
        return $this->users;
    }

    public function addUser(User $user): static
    {
        if (!$this->users->contains($user)) {
            $this->users->add($user);
            $user->addExerciceDone($this);
        }
        return $this;
    }

    public function removeUser(User $user): static
    {
        if ($this->users->removeElement($user)) {
            $user->removeExerciceDone($this);
        }
        return $this;
    }
}
