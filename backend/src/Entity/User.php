<?php

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;
use Gedmo\Timestampable\Traits\TimestampableEntity;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: '`user`')]
#[UniqueEntity(fields: ['email'], message: 'There is already an account with this email')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    use TimestampableEntity;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 50)]
    private ?string $lastname = null;

    #[ORM\Column(length: 50)]
    private ?string $firstname = null;

    #[ORM\Column(length: 180, unique: true)]
    #[Assert\NotBlank]
    #[Assert\Email]
    private ?string $email = null;

    #[ORM\Column(length: 255)]
    private ?string $password = null;

    #[ORM\Column]
    private array $role = [];

    #[ORM\Column]
    private bool $isVerified = false;

    #[ORM\Column]
    private bool $isActive = true;

    /** @var Collection<int, BreathingExercice> */
    #[ORM\ManyToMany(targetEntity: BreathingExercice::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'user_breathing_exercice')]
    private Collection $exerciceDone;

    /** @var Collection<int, Resource> */
    #[ORM\OneToMany(targetEntity: Resource::class, mappedBy: 'author')]
    private Collection $resourcesCreated;

    /** @var Collection<int, Resource> */
    #[ORM\ManyToMany(targetEntity: Resource::class, inversedBy: 'readByUsers')]
    #[ORM\JoinTable(name: 'user_resource_read')]
    private Collection $readResources;

    /** @var Collection<int, Resource> */
    #[ORM\ManyToMany(targetEntity: Resource::class, inversedBy: 'favoritedByUsers')]
    #[ORM\JoinTable(name: 'user_resource_favorite')]
    private Collection $favoriteResources;

    public function __construct()
    {
        $this->exerciceDone = new ArrayCollection();
        $this->resourcesCreated = new ArrayCollection();
        $this->readResources = new ArrayCollection();
        $this->favoriteResources = new ArrayCollection();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getLastname(): ?string
    {
        return $this->lastname;
    }

    public function setLastname(string $lastname): static
    {
        $this->lastname = $lastname;
        return $this;
    }

    public function getFirstname(): ?string
    {
        return $this->firstname;
    }

    public function setFirstname(string $firstname): static
    {
        $this->firstname = $firstname;
        return $this;
    }

    public function getEmail(): ?string
    {
        return $this->email;
    }

    public function setEmail(string $email): static
    {
        $this->email = $email;
        return $this;
    }

    public function getUserIdentifier(): string
    {
        return (string) $this->email;
    }

    public function getRoles(): array
    {
        $roles = $this->role;
        $roles[] = 'ROLE_USER';
        return array_unique($roles);
    }

    public function setRole(array $role): static
    {
        $this->role = $role;
        return $this;
    }

    public function getPassword(): ?string
    {
        return $this->password;
    }

    public function setPassword(string $password): static
    {
        $this->password = $password;
        return $this;
    }

    public function eraseCredentials(): void {}

    public function isVerified(): bool
    {
        return $this->isVerified;
    }

    public function setIsVerified(bool $isVerified): static
    {
        $this->isVerified = $isVerified;
        return $this;
    }

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $isActive): static
    {
        $this->isActive = $isActive;
        return $this;
    }

    /** @return Collection<int, BreathingExercice> */
    public function getExerciceDone(): Collection
    {
        return $this->exerciceDone;
    }

    public function addExerciceDone(BreathingExercice $exercice): static
    {
        if (!$this->exerciceDone->contains($exercice)) {
            $this->exerciceDone->add($exercice);
        }
        return $this;
    }

    public function removeExerciceDone(BreathingExercice $exercice): static
    {
        $this->exerciceDone->removeElement($exercice);
        return $this;
    }

    /** @return Collection<int, Resource> */
    public function getResourcesCreated(): Collection
    {
        return $this->resourcesCreated;
    }

    /** @return Collection<int, Resource> */
    public function getReadResources(): Collection
    {
        return $this->readResources;
    }

    public function addReadResource(Resource $resource): static
    {
        if (!$this->readResources->contains($resource)) {
            $this->readResources->add($resource);
        }
        return $this;
    }

    public function removeReadResource(Resource $resource): static
    {
        $this->readResources->removeElement($resource);
        return $this;
    }

    /** @return Collection<int, Resource> */
    public function getFavoriteResources(): Collection
    {
        return $this->favoriteResources;
    }

    public function addFavoriteResource(Resource $resource): static
    {
        if (!$this->favoriteResources->contains($resource)) {
            $this->favoriteResources->add($resource);
        }
        return $this;
    }

    public function removeFavoriteResource(Resource $resource): static
    {
        $this->favoriteResources->removeElement($resource);
        return $this;
    }
}
