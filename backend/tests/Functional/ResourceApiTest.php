<?php

namespace App\Tests\Functional;

use App\Entity\Resource;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

class ResourceApiTest extends WebTestCase
{
    private KernelBrowser $client;
    private string $userToken;
    private string $redactorToken;
    private string $adminToken;

    protected function setUp(): void
    {
        $this->client = static::createClient();

        $this->createUser('res_user@example.com', 'password', ['ROLE_USER']);
        $this->createUser('res_redactor@example.com', 'password', ['ROLE_REDACTOR']);
        $this->createUser('res_admin@example.com', 'password', ['ROLE_ADMIN']);

        $this->userToken = $this->getToken('res_user@example.com', 'password');
        $this->redactorToken = $this->getToken('res_redactor@example.com', 'password');
        $this->adminToken = $this->getToken('res_admin@example.com', 'password');
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

    private function createResource(User $author, string $title = 'Test Resource'): Resource
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $resource = new Resource();
        $resource->setTitle($title);
        $resource->setText('Some text content');
        $resource->setType('article');
        $resource->setVisible(true);
        $resource->setAuthor($author);
        $em->persist($resource);
        $em->flush();
        return $resource;
    }

    public function testListResourcesIsPublic(): void
    {
        $this->client->request('GET', '/api/resources');
        $this->assertResponseIsSuccessful();
        $this->assertJson($this->client->getResponse()->getContent());
    }

    public function testShowResourceRequiresAuth(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $author = $em->getRepository(User::class)->findOneBy(['email' => 'res_redactor@example.com']);
        $resource = $this->createResource($author);

        $this->client->request('GET', '/api/resources/' . $resource->getId());
        $this->assertResponseStatusCodeSame(401);
    }

    public function testCreateResourceRequiresRedactorRole(): void
    {
        $this->client->request('POST', '/api/resources', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ], json_encode([
            'title' => 'New Resource',
            'text' => 'Content',
            'type' => 'article',
        ]));

        $this->assertResponseStatusCodeSame(403);
    }

    public function testRedactorCanCreateResource(): void
    {
        $this->client->request('POST', '/api/resources', [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->redactorToken,
        ], json_encode([
            'title' => 'Created by Redactor',
            'text' => 'Content here',
            'type' => 'article',
        ]));

        $this->assertResponseStatusCodeSame(201);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('Created by Redactor', $data['title']);
    }

    public function testMarkResourceAsRead(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $author = $em->getRepository(User::class)->findOneBy(['email' => 'res_redactor@example.com']);
        $resource = $this->createResource($author, 'Readable Resource');

        $this->client->request('POST', '/api/resources/' . $resource->getId() . '/read', [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);

        $this->assertResponseIsSuccessful();
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertTrue($data['isRead']);
    }

    public function testToggleFavorite(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $author = $em->getRepository(User::class)->findOneBy(['email' => 'res_redactor@example.com']);
        $resource = $this->createResource($author, 'Favoriteable Resource');

        $this->client->request('POST', '/api/resources/' . $resource->getId() . '/favorite', [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertTrue($data['isFavorite']);

        $this->client->request('POST', '/api/resources/' . $resource->getId() . '/favorite', [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertFalse($data['isFavorite']);
    }

    public function testAdminCanDeleteAnyResource(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $author = $em->getRepository(User::class)->findOneBy(['email' => 'res_redactor@example.com']);
        $resource = $this->createResource($author, 'To Be Deleted');

        $this->client->request('DELETE', '/api/resources/' . $resource->getId(), [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->adminToken,
        ]);

        $this->assertResponseStatusCodeSame(204);
    }

    public function testUserCannotDeleteOthersResource(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $author = $em->getRepository(User::class)->findOneBy(['email' => 'res_redactor@example.com']);
        $resource = $this->createResource($author, 'Protected Resource');

        $this->client->request('DELETE', '/api/resources/' . $resource->getId(), [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->userToken,
        ]);

        $this->assertResponseStatusCodeSame(403);
    }

    protected function tearDown(): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $em->createQuery('DELETE FROM App\Entity\Resource r WHERE r.title IN (:titles)')
            ->setParameter('titles', ['Created by Redactor', 'Test Resource', 'Readable Resource', 'Favoriteable Resource', 'To Be Deleted', 'Protected Resource'])
            ->execute();
        $em->createQuery('DELETE FROM App\Entity\User u WHERE u.email LIKE :prefix')
            ->setParameter('prefix', 'res_%')
            ->execute();
        parent::tearDown();
    }
}
