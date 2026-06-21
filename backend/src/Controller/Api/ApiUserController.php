<?php

namespace App\Controller\Api;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api/users')]
#[IsGranted('ROLE_ADMIN')]
class ApiUserController extends AbstractController
{
    private function serialize(User $user): array
    {
        return [
            'id' => $user->getId(),
            'email' => $user->getEmail(),
            'firstname' => $user->getFirstname(),
            'lastname' => $user->getLastname(),
            'roles' => $user->getRoles(),
            'isVerified' => $user->isVerified(),
            'createdAt' => $user->getCreatedAt()?->format('Y-m-d H:i:s'),
        ];
    }

    #[Route('', name: 'api_user_list', methods: ['GET'])]
    public function list(UserRepository $repo): JsonResponse
    {
        return $this->json(array_map(fn($u) => $this->serialize($u), $repo->findAll()));
    }

    #[Route('', name: 'api_user_create', methods: ['POST'])]
    public function create(
        Request $request,
        UserPasswordHasherInterface $hasher,
        EntityManagerInterface $em,
        ValidatorInterface $validator
    ): JsonResponse {
        $data = json_decode($request->getContent(), true);

        if (!$data) {
            return $this->json(['message' => 'Invalid JSON'], Response::HTTP_BAD_REQUEST);
        }

        foreach (['email', 'password', 'firstname', 'lastname'] as $field) {
            if (empty($data[$field])) {
                return $this->json(['message' => "Field '$field' is required"], Response::HTTP_BAD_REQUEST);
            }
        }

        $allowed = ['ROLE_USER', 'ROLE_REDACTOR', 'ROLE_ADMIN'];
        $role = $data['role'] ?? 'ROLE_USER';
        if (!in_array($role, $allowed)) {
            return $this->json(['message' => 'Invalid role'], Response::HTTP_BAD_REQUEST);
        }

        $user = new User();
        $user->setEmail($data['email']);
        $user->setFirstname($data['firstname']);
        $user->setLastname($data['lastname']);
        $user->setPassword($hasher->hashPassword($user, $data['password']));
        $user->setRole([$role]);

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

        return $this->json($this->serialize($user), Response::HTTP_CREATED);
    }

    #[Route('/{id}/role', name: 'api_user_role', methods: ['PUT'])]
    public function updateRole(User $user, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $allowed = ['ROLE_USER', 'ROLE_REDACTOR', 'ROLE_ADMIN'];
        $role = $data['role'] ?? null;

        if (!in_array($role, $allowed)) {
            return $this->json(['message' => 'Invalid role. Allowed: ' . implode(', ', $allowed)], Response::HTTP_BAD_REQUEST);
        }

        $user->setRole([$role]);
        $em->flush();

        return $this->json($this->serialize($user));
    }

    #[Route('/{id}', name: 'api_user_delete', methods: ['DELETE'])]
    public function delete(User $user, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $currentUser */
        $currentUser = $this->getUser();

        if ($user->getId() === $currentUser->getId()) {
            return $this->json(['message' => 'Cannot delete your own account'], Response::HTTP_BAD_REQUEST);
        }

        $em->remove($user);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }
}
