<?php

namespace App\Controller\Api;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api')]
class AuthController extends AbstractController
{
    #[Route('/register', name: 'api_register', methods: ['POST'])]
    public function register(
        Request $request,
        UserPasswordHasherInterface $hasher,
        EntityManagerInterface $em,
        ValidatorInterface $validator,
        #[Autowire(service: 'limiter.register_ip')] RateLimiterFactory $registerIpLimiter
    ): JsonResponse {
        if (!$registerIpLimiter->create($request->getClientIp())->consume(1)->isAccepted()) {
            return $this->json(['message' => 'Trop de tentatives, réessayez plus tard'], Response::HTTP_TOO_MANY_REQUESTS);
        }

        $data = json_decode($request->getContent(), true);

        if (!$data) {
            return $this->json(['message' => 'Invalid JSON'], Response::HTTP_BAD_REQUEST);
        }

        $required = ['email', 'password', 'firstname', 'lastname'];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                return $this->json(['message' => "Field '$field' is required"], Response::HTTP_BAD_REQUEST);
            }
        }

        $passwordErrors = $validator->validate($data['password'], [
            new Assert\Length(min: 8, max: 4096, minMessage: 'Le mot de passe doit contenir au moins {{ limit }} caractères'),
            new Assert\Regex(
                pattern: '/^(?=.*[A-Za-z])(?=.*\d).+$/',
                message: 'Le mot de passe doit contenir au moins une lettre et un chiffre'
            ),
        ]);
        if (count($passwordErrors) > 0) {
            $messages = [];
            foreach ($passwordErrors as $error) {
                $messages[] = $error->getMessage();
            }
            return $this->json(['message' => implode(', ', $messages)], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $user = new User();
        $user->setEmail($data['email']);
        $user->setFirstname($data['firstname']);
        $user->setLastname($data['lastname']);
        $user->setPassword($hasher->hashPassword($user, $data['password']));
        $user->setRole(['ROLE_USER']);

        $errors = $validator->validate($user);
        if (count($errors) > 0) {
            $messages = [];
            foreach ($errors as $error) {
                $messages[] = $error->getMessage();
            }
            return $this->json(['message' => implode(', ', $messages)], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $em->persist($user);
        $em->flush();

        return $this->json([
            'message' => 'User created successfully',
            'user' => [
                'id' => $user->getId(),
                'email' => $user->getEmail(),
                'firstname' => $user->getFirstname(),
                'lastname' => $user->getLastname(),
                'roles' => $user->getRoles(),
            ],
        ], Response::HTTP_CREATED);
    }

    #[Route('/me', name: 'api_me', methods: ['GET'])]
    public function me(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        return $this->json($this->serializeUser($user));
    }

    #[Route('/me', name: 'api_me_update', methods: ['PUT'])]
    public function updateMe(
        Request $request,
        UserPasswordHasherInterface $hasher,
        EntityManagerInterface $em,
        ValidatorInterface $validator
    ): JsonResponse {
        /** @var User $user */
        $user = $this->getUser();
        $data = json_decode($request->getContent(), true);

        if (!$data) {
            return $this->json(['message' => 'Invalid JSON'], Response::HTTP_BAD_REQUEST);
        }

        if (isset($data['firstname']) && $data['firstname'] !== '') {
            $user->setFirstname($data['firstname']);
        }
        if (isset($data['lastname']) && $data['lastname'] !== '') {
            $user->setLastname($data['lastname']);
        }
        if (isset($data['email']) && $data['email'] !== '') {
            $user->setEmail($data['email']);
        }
        if (!empty($data['password'])) {
            $user->setPassword($hasher->hashPassword($user, $data['password']));
        }

        $errors = $validator->validate($user);
        if (count($errors) > 0) {
            $messages = [];
            foreach ($errors as $error) {
                $messages[] = $error->getMessage();
            }
            return $this->json(['message' => implode(', ', $messages)], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $em->flush();

        return $this->json($this->serializeUser($user));
    }

    #[Route('/me', name: 'api_me_delete', methods: ['DELETE'])]
    public function deleteMe(EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();
        $em->remove($user);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/me/activity', name: 'api_me_activity', methods: ['GET'])]
    public function myActivity(): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $favorites = array_map(fn($r) => [
            'id' => $r->getId(),
            'title' => $r->getTitle(),
            'type' => $r->getType(),
        ], $user->getFavoriteResources()->toArray());

        $read = array_map(fn($r) => [
            'id' => $r->getId(),
            'title' => $r->getTitle(),
            'type' => $r->getType(),
        ], $user->getReadResources()->toArray());

        $exercises = array_map(fn($e) => [
            'id' => $e->getId(),
            'name' => $e->getName(),
            'type' => $e->getType(),
            'duration' => $e->getDuration(),
        ], $user->getExerciceDone()->toArray());

        return $this->json([
            'favoriteResources' => $favorites,
            'readResources' => $read,
            'completedExercises' => $exercises,
        ]);
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'firstname' => $user->getFirstname(),
            'lastname' => $user->getLastname(),
            'roles' => $user->getRoles(),
        ];
    }
}
