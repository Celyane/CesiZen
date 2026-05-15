<?php

namespace App\Controller\Api;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

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
