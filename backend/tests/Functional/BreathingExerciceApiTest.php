<?php

namespace App\Tests\Functional;

use App\Entity\BreathingExercice;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class BreathingExerciceApiTest extends WebTestCase
{
    private KernelBrowser $client;
    private string $userToken;
    private string $adminToken;

    protected function setUp(): void
    {
        $this->client = static::createClient();

        $this->createUser('be_user@example.com', 'password', ['ROLE_USER']);
        $this->createUser('be_admin@example.com', 'password', ['ROLE_ADMIN']);

        $this->userToken = $this->getToken('be_user@example.com', 'password');
        $this->adminToken = $this->getToken('be_admin@example.com', 'password');
    }

    private function createUser(string $email, string $password, array $roles = ['ROLE_USER']): User
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $hasher = static::getContainer()->get(UserPasswordHasherInterface::class);

        $user = new User();
        $user->setEmail($email);
        $user->setFirstname('Test');
        $user->setLastname('User');
        $user->setRole($roles);
        $user->setPassword($hasher->hashPassword($user, $password));

        $em->persist($user);
        $em->flush();

        return $user;
    }

    private function getToken(string $email, string $password): string
    {
        $this->client->request('POST', '/api/login', [], [], ['CONTENT_TYPE' => 'application/json'], json_encode([
            'email' => $email,
            'password' => $password,
        ]));
        $data = json_decode($this->client->getResponse()->getContent(), true);
        return $data['token'];
    }

    private function createExercice(string $name = 'Test Exercise'): BreathingExercice
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $ex = new BreathingExercice();
        $ex->setName($name);
        $ex->setDuration(300);
        $ex->setDescription('A breathing exercise');
        $ex->setType('relaxation');
        $ex->setTimeInhale(5);
        $ex->setTimeHold(null);
        $ex->setTimeExhale(5);
        $ex->setNumberCycle(6);
        $em->persist($ex);
        $em->flush();
        return $ex;
    }

    public function testListRequiresAuthentication(): void
    {
        $this->client->request('GET', '/api/breathing-exercices');
        $this->assertResponseStatusCodeSame(401);
    }

    public function testListReturnsExercices(): void
    {
        $this->createExercice('Cohérence cardiaque');

        $this->client->request('GET', '/api/breathing-exercices', [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);

        $this->assertResponseIsSuccessful();
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertIsArray($data);
    }

    public function testUserCannotCreateExercice(): void
    {
        $this->client->request('POST', '/api/breathing-exercices', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ], json_encode([
            'name' => 'Unauthorized', 'duration' => 60,
            'description' => 'Test', 'type' => 'test',
            'timeInhale' => 4, 'timeExhale' => 6, 'numberCycle' => 5,
        ]));

        $this->assertResponseStatusCodeSame(403);
    }

    public function testAdminCanCreateExercice(): void
    {
        $this->client->request('POST', '/api/breathing-exercices', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->adminToken,
        ], json_encode([
            'name' => 'Admin Created',
            'duration' => 180,
            'description' => 'Created by admin',
            'type' => 'anti-stress',
            'timeInhale' => 4,
            'timeHold' => 7,
            'timeExhale' => 8,
            'numberCycle' => 4,
        ]));

        $this->assertResponseStatusCodeSame(201);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('Admin Created', $data['name']);
        $this->assertSame(7, $data['timeHold']);
    }

    public function testMarkExerciceAsComplete(): void
    {
        $ex = $this->createExercice('Complete Me');

        $this->client->request('POST', '/api/breathing-exercices/' . $ex->getId() . '/complete', [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);

        $this->assertResponseIsSuccessful();
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertTrue($data['isDone']);
    }

    public function testAdminCanDeleteExercice(): void
    {
        $ex = $this->createExercice('Delete Me');

        $this->client->request('DELETE', '/api/breathing-exercices/' . $ex->getId(), [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->adminToken,
        ]);

        $this->assertResponseStatusCodeSame(204);
    }

    protected function tearDown(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->createQuery('DELETE FROM App\Entity\BreathingExercice e WHERE e.name IN (:names)')
            ->setParameter('names', ['Test Exercise', 'Cohérence cardiaque', 'Admin Created', 'Complete Me', 'Delete Me'])
            ->execute();
        $em->createQuery('DELETE FROM App\Entity\User u WHERE u.email LIKE :prefix')
            ->setParameter('prefix', 'be_%')
            ->execute();
        parent::tearDown();
    }
}
